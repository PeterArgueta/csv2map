"""Tiny synthetic streams, reduced quotas; no abusive requests to production."""
import asyncio
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette import formparsers

import main
from utils import intake_security as security


def scope(headers=None, peer='192.0.2.1', path='/convertir_formato/'):
    return {'type':'http','http_version':'1.1','method':'POST','scheme':'http',
            'path':path,'raw_path':path.encode(),'query_string':b'',
            'headers':headers or [],'client':(peer,1234),'server':('test',80)}


def invoke(app, request_scope, chunks=()):
    messages, reads = [], []
    iterator = iter(chunks)
    async def receive():
        reads.append(True)
        return next(iterator)
    async def send(message):
        messages.append(message)
    asyncio.run(app(request_scope, receive, send))
    return next(m['status'] for m in messages if m['type']=='http.response.start'), messages, reads


def middleware(app):
    return security.IntakeMiddleware(app, security.IntakeLimiter())


@pytest.mark.parametrize('length,status', [(b'100',413),(b'-1',400),(b'garbage',400),(b'9 9',400)])
def test_header_rejection_never_reads_or_parses(monkeypatch, length, status):
    monkeypatch.setattr(security, 'MAX_BODY_BYTES', 10)
    async def forbidden(*args):
        pytest.fail('Downstream parser must not run')
    result, messages, reads = invoke(middleware(forbidden), scope([(b'content-length',length)]))
    assert result == status and not reads
    assert (b'connection',b'close') in messages[0]['headers']


def test_duplicate_length_rejected():
    async def forbidden(*args):
        pytest.fail('Downstream parser must not run')
    result, _, reads = invoke(middleware(forbidden), scope([(b'content-length',b'1'),(b'content-length',b'1')]))
    assert result == 400 and not reads


@pytest.mark.parametrize('headers', [[], [(b'content-length',b'1')], [(b'transfer-encoding',b'chunked')]])
def test_actual_bytes_stop_stream_before_oversized_chunk(monkeypatch, headers):
    monkeypatch.setattr(security, 'MAX_BODY_BYTES', 5)
    delivered = []
    async def downstream(s, receive, send):
        delivered.append((await receive())['body'])
        await receive()
        pytest.fail('Oversized chunk must not reach parser')
    chunks = [{'type':'http.request','body':b'abc','more_body':True},
              {'type':'http.request','body':b'def','more_body':False}]
    status, _, _ = invoke(middleware(downstream), scope(headers), chunks)
    assert status == 413 and delivered == [b'abc']


def test_idle_and_total_upload_deadlines(monkeypatch):
    monkeypatch.setattr(security, 'IDLE_SECONDS', 0.02)
    async def downstream(s, receive, send):
        await receive()
    async def delayed():
        await asyncio.sleep(1)
    messages = []
    async def send(m):
        messages.append(m)
    asyncio.run(middleware(downstream)(scope(), delayed, send))
    assert messages[0]['status'] == 408
    monkeypatch.setattr(security, 'UPLOAD_SECONDS', -1)
    status,_,reads=invoke(middleware(downstream),scope())
    assert status == 408 and not reads


def test_disconnect_is_controlled():
    async def downstream(s, receive, send):
        await receive()
    status,_,_=invoke(middleware(downstream),scope(),[{'type':'http.disconnect'}])
    assert status == 400


def test_rate_limit_refill_and_no_forwarded_header_spoof(monkeypatch):
    clock=[1000.0]
    monkeypatch.setattr(security.time,'monotonic',lambda:clock[0])
    limiter=security.IntakeLimiter()
    for i in range(10):
        assert limiter.allow(scope([(b'x-forwarded-for',f'198.51.100.{i}'.encode())]))[0]
    allowed,retry=limiter.allow(scope([(b'x-real-ip',b'203.0.113.1')]))
    assert not allowed and retry == 3
    clock[0]+=3
    assert limiter.allow(scope())[0]
    assert len(limiter.clients)==1


def test_ipv6_prefix_and_mapped_ipv4_identity():
    limiter=security.IntakeLimiter()
    assert limiter.identity(scope(peer='2001:db8::1'))==limiter.identity(scope(peer='2001:db8::99'))
    assert limiter.identity(scope(peer='::ffff:192.0.2.1'))==limiter.identity(scope(peer='192.0.2.1'))


def test_global_rate_limit_and_bounded_identity_registry(monkeypatch):
    limiter=security.IntakeLimiter()
    for i in range(20):
        assert limiter.allow(scope(peer=f'192.0.2.{i+1}'))[0]
    assert not limiter.allow(scope(peer='198.51.100.1'))[0]
    assert len(limiter.clients)==20
    monkeypatch.setattr(security,'MAX_IDENTITIES',2)
    limiter=security.IntakeLimiter()
    assert limiter.allow(scope(peer='192.0.2.1'))[0]
    assert limiter.allow(scope(peer='192.0.2.2'))[0]
    assert not limiter.allow(scope(peer='192.0.2.3'))[0]
    assert len(limiter.clients)==2


def test_429_rejects_without_reading():
    async def forbidden(*args):
        pytest.fail('Downstream parser must not run')
    app=middleware(forbidden)
    for _ in range(10):
        assert app.limiter.allow(scope())[0]
    status,messages,reads=invoke(app,scope())
    assert status==429 and not reads
    assert any(k==b'retry-after' for k,v in messages[0]['headers'])


def test_busy_intake_does_not_receive_and_health_bypasses_gate():
    async def downstream(s, receive, send):
        await JSONResponse({'ok':True})(s,receive,send)
    app=middleware(downstream)
    assert app.slot.acquire(blocking=False)
    try:
        status,_,reads=invoke(app,scope())
        assert status==503 and not reads
        healthy=scope(path='/health');healthy['method']='GET'
        assert invoke(app,healthy)[0]==200
    finally:
        app.slot.release()


def test_whole_request_timeout_releases_slot(monkeypatch):
    monkeypatch.setattr(security,'REQUEST_SECONDS',0.02)
    async def downstream(*args):
        await asyncio.sleep(1)
    app=middleware(downstream)
    assert invoke(app,scope())[0]==408
    assert app.slot.acquire(blocking=False)
    app.slot.release()


def multipart(parts, end=True):
    body=b''
    for name,value,filename in parts:
        header=f'--synthetic\r\nContent-Disposition: form-data; name="{name}"'
        if filename is not None:
            header+=f'; filename="{filename}"'
        body+=header.encode()+b'\r\n\r\n'+value+b'\r\n'
    return body+(b'--synthetic--\r\n' if end else b'')


@pytest.fixture
def tracked_spools(monkeypatch):
    created=[]
    original=formparsers.SpooledTemporaryFile
    def factory(*args,**kwargs):
        spool=original(*args,**kwargs);created.append(spool);return spool
    monkeypatch.setattr(formparsers,'SpooledTemporaryFile',factory)
    return created


def parser_app():
    app=FastAPI()
    app.router.route_class=security.IntakeRoute
    limiter=security.IntakeLimiter()
    app.add_middleware(security.IntakeMiddleware,limiter=limiter)
    @app.post('/inspeccionar_tabla/')
    async def endpoint(request:Request):
        form=await request.form()
        return {'fields':len(form)}
    return app


@pytest.mark.parametrize('case,status', [('files',400),('fields',400),('field_size',400),('file_size',413),('header_size',413),('truncated',400)])
def test_multipart_limits_and_spool_cleanup(monkeypatch,tracked_spools,case,status):
    monkeypatch.setattr(security,'MAX_FILE_BYTES',8)
    monkeypatch.setattr(security,'MAX_FIELD_BYTES',8)
    monkeypatch.setattr(security,'MAX_PART_HEADER_BYTES',256)
    parts=[('file',b'ok','tiny.csv')];end=True
    if case=='files':parts+=[('other',b'ok','two.csv')]
    if case=='fields':parts += [(f'f{i}',b'x',None) for i in range(11)]
    if case=='field_size':parts += [('formatos',b'x'*9,None)]
    if case=='file_size':parts=[('file',b'x'*9,'tiny.csv')]
    if case=='header_size':parts += [('name'*80,b'x',None)]
    if case=='truncated':end=False
    response=TestClient(parser_app()).post('/inspeccionar_tabla/',content=multipart(parts,end),headers={'Content-Type':'multipart/form-data; boundary=synthetic'})
    assert response.status_code==status,response.text
    assert tracked_spools and all(p.closed for p in tracked_spools)


def test_parser_success_closes_spools(tracked_spools):
    response=TestClient(parser_app()).post('/inspeccionar_tabla/',content=multipart([('file',b'ok','tiny.csv')]),headers={'Content-Type':'multipart/form-data; boundary=synthetic'})
    assert response.status_code==200
    assert tracked_spools and all(p.closed for p in tracked_spools)


def test_receive_limit_after_partial_file_closes_spool(monkeypatch,tracked_spools):
    monkeypatch.setattr(security,'MAX_BODY_BYTES',200)
    first=multipart([('file',b'x','tiny.csv')],end=False)
    headers=[(b'content-type',b'multipart/form-data; boundary=synthetic')]
    chunks=[{'type':'http.request','body':first,'more_body':True},
            {'type':'http.request','body':b'x'*201,'more_body':False}]
    status,_,_=invoke(parser_app(),scope(headers,path='/inspeccionar_tabla/'),chunks)
    assert status==413
    assert tracked_spools and all(p.closed for p in tracked_spools)


def test_cors_on_early_rejection(monkeypatch):
    monkeypatch.setattr(security,'MAX_BODY_BYTES',10)
    response=TestClient(main.app).post('/inspeccionar_tabla/',content=b'x'*11,headers={'Origin':'https://converttomap.com'})
    assert response.status_code==413
    assert response.headers['access-control-allow-origin']=='https://converttomap.com'


def test_idle_timeout_after_spooling_closes_file(monkeypatch,tracked_spools):
    monkeypatch.setattr(security,'IDLE_SECONDS',0.02)
    first=multipart([('file',b'x','tiny.csv')],end=False)
    reads=0;messages=[]
    async def receive():
        nonlocal reads
        reads+=1
        if reads==1:return {'type':'http.request','body':first,'more_body':True}
        await asyncio.sleep(1)
    async def send(message):messages.append(message)
    request_scope=scope([(b'content-type',b'multipart/form-data; boundary=synthetic')],path='/inspeccionar_tabla/')
    asyncio.run(parser_app()(request_scope,receive,send))
    assert messages[0]['status']==408
    assert tracked_spools and all(p.closed for p in tracked_spools)


def test_cancelled_parser_closes_partial_file(tracked_spools):
    first=multipart([('file',b'x','tiny.csv')],end=False)
    reads=0
    async def receive():
        nonlocal reads
        reads+=1
        if reads==1:return {'type':'http.request','body':first,'more_body':True}
        await asyncio.sleep(1)
    async def send(message):pass
    async def exercise():
        request_scope=scope([(b'content-type',b'multipart/form-data; boundary=synthetic')],path='/inspeccionar_tabla/')
        task=asyncio.create_task(parser_app()(request_scope,receive,send))
        for _ in range(100):
            if tracked_spools:break
            await asyncio.sleep(0.001)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):await task
    asyncio.run(exercise())
    assert tracked_spools and all(p.closed for p in tracked_spools)


def test_slow_download_cancels_response_and_releases_gate(monkeypatch):
    monkeypatch.setattr(security,'DOWNLOAD_SECONDS',0.02)
    cleaned=[];messages=[]
    async def downstream(s,receive,send):
        try:
            await send({'type':'http.response.start','status':200,'headers':[]})
            await send({'type':'http.response.body','body':b'synthetic','more_body':False})
        finally:cleaned.append(True)
    async def send(message):
        messages.append(message)
        if message['type']=='http.response.body':await asyncio.sleep(1)
    async def receive():pytest.fail('No body should be read')
    app=middleware(downstream)
    asyncio.run(app(scope(),receive,send))
    assert cleaned and len([m for m in messages if m['type']=='http.response.start'])==1
    assert app.slot.acquire(blocking=False)
    app.slot.release()


def test_exact_file_and_field_quota_is_accepted(monkeypatch,tracked_spools):
    monkeypatch.setattr(security,'MAX_FILE_BYTES',8)
    monkeypatch.setattr(security,'MAX_FIELD_BYTES',8)
    body=multipart([('file',b'x'*8,'tiny.csv'),('field',b'x'*8,None)])
    response=TestClient(parser_app()).post('/inspeccionar_tabla/',content=body,headers={'Content-Type':'multipart/form-data; boundary=synthetic'})
    assert response.status_code==200
    assert tracked_spools and all(p.closed for p in tracked_spools)


def test_malformed_multipart_is_400_not_server_error():
    response=TestClient(parser_app()).post('/inspeccionar_tabla/',content=b'not multipart',headers={'Content-Type':'multipart/form-data; boundary=synthetic'})
    assert response.status_code==400


def test_finished_upload_does_not_apply_idle_timer_to_disconnect_wait(monkeypatch):
    monkeypatch.setattr(security,'IDLE_SECONDS',0.01)
    messages=[];reads=0
    async def receive():
        nonlocal reads
        reads+=1
        if reads==1:return {'type':'http.request','body':b'x','more_body':False}
        await asyncio.sleep(0.03)
        return {'type':'http.disconnect'}
    async def send(message):messages.append(message)
    async def downstream(s,receive,send):
        await receive()
        assert (await receive())['type']=='http.disconnect'
        await JSONResponse({'ok':True})(s,receive,send)
    asyncio.run(middleware(downstream)(scope(),receive,send))
    assert messages[0]['status']==200
