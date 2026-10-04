"""Test deadline/cancellation locally with tiny processes; no load on production."""
import asyncio
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import time

import geopandas as gpd
import pandas as pd
import pytest
from fastapi import BackgroundTasks, HTTPException, UploadFile
from fastapi.testclient import TestClient
from shapely.geometry import LineString

import main
from utils import conversion_jobs as jobs


def fake_worker(tmp_path, monkeypatch, code):
    worker = tmp_path / 'worker.py'
    worker.write_text('import sys,json,time,os\nfrom pathlib import Path\nroot=Path(sys.argv[1])\n' + code)
    monkeypatch.setattr(jobs, 'WORKER', worker)
    monkeypatch.setattr(jobs, 'POLL_SECONDS', 0.02)


def test_timeout_kills_process_group_and_keeps_event_loop_responsive(tmp_path, monkeypatch):
    fake_worker(tmp_path, monkeypatch, "import subprocess\nchild=subprocess.Popen([sys.executable,'-I','-c','import time; time.sleep(20)'])\n(root/'child.pid').write_text(str(child.pid))\ntime.sleep(20)\n")
    monkeypatch.setattr(jobs, 'JOB_TIMEOUT_SECONDS', 0.4)
    async def exercise():
        task = asyncio.create_task(jobs.supervise(tmp_path, 'synthetic'))
        ticks = 0
        while not task.done():
            ticks += 1
            await asyncio.sleep(0.02)
        with pytest.raises(HTTPException) as error:
            await task
        assert error.value.status_code == 504
        assert ticks >= 5
    started = time.monotonic()
    asyncio.run(exercise())
    assert time.monotonic() - started < 3
    pid = int((tmp_path / 'child.pid').read_text())
    state_path = Path(f'/proc/{pid}/stat')
    assert not state_path.exists() or state_path.read_text().split()[2] == 'Z'


def test_cancelled_job_is_killed_and_reaped(tmp_path, monkeypatch):
    fake_worker(tmp_path, monkeypatch, "(root/'pid').write_text(str(os.getpid()))\ntime.sleep(20)\n")
    async def exercise():
        task = asyncio.create_task(jobs.supervise(tmp_path, 'synthetic'))
        for _ in range(100):
            if (tmp_path / 'pid').exists():
                break
            await asyncio.sleep(0.01)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    asyncio.run(exercise())
    pid = int((tmp_path / 'pid').read_text())
    with pytest.raises(ProcessLookupError):
        os.kill(pid, 0)


def test_worker_has_no_inherited_secrets_or_shell(tmp_path, monkeypatch):
    monkeypatch.setenv('CTM_SYNTHETIC_SECRET', 'synthetic-never-inherit')
    fake_worker(tmp_path, monkeypatch, "assert 'CTM_SYNTHETIC_SECRET' not in os.environ\nassert sys.flags.isolated\nassert os.environ['OPENBLAS_NUM_THREADS']=='1'\n(root/'result.json').write_text(json.dumps({'kind':'json','data':{'ok':True}}))\n")
    assert asyncio.run(jobs.supervise(tmp_path, 'synthetic'))['data']['ok']


@pytest.mark.parametrize('code,status', [
    ("(root/'large').write_bytes(b'x'*1024)\ntime.sleep(20)\n", 422),
    ("raise SystemExit(1)\n", 422),
    ("(root/'result.json').write_text('x'*1024)\n", 422),
])
def test_workspace_crash_and_result_limits(tmp_path, monkeypatch, code, status):
    fake_worker(tmp_path, monkeypatch, code)
    monkeypatch.setattr(jobs, 'MAX_WORKSPACE_BYTES', 512)
    monkeypatch.setattr(jobs, 'MAX_RESULT_BYTES', 512)
    with pytest.raises(HTTPException) as error:
        asyncio.run(jobs.supervise(tmp_path, 'synthetic'))
    assert error.value.status_code == status


def test_busy_rejects_without_reading_upload():
    class Upload:
        async def read(self, *args):
            pytest.fail('Busy request must not be read or queued')
    assert jobs.SLOTS.acquire(blocking=False)
    try:
        with pytest.raises(HTTPException) as error:
            asyncio.run(main.inspeccionar_tabla(file=Upload(), hoja=None))
        assert error.value.status_code == 503
        assert error.value.headers['Retry-After'] == '5'
    finally:
        jobs.SLOTS.release()


def test_failure_cleans_workspace_and_releases_slot(tmp_path, monkeypatch):
    fake_worker(tmp_path, monkeypatch, "time.sleep(20)\n")
    monkeypatch.setattr(jobs, 'JOB_TIMEOUT_SECONDS', 0.2)
    workspace = tmp_path / 'request'
    workspace.mkdir()
    monkeypatch.setattr(jobs.tempfile, 'mkdtemp', lambda **kwargs: str(workspace))
    with pytest.raises(HTTPException) as error:
        asyncio.run(main.inspeccionar_tabla(file=UploadFile(io.BytesIO(b'a\n1\n'), filename='small.csv'), hoja=None))
    assert error.value.status_code == 504
    assert not workspace.exists()
    assert jobs.SLOTS.acquire(blocking=False)
    jobs.SLOTS.release()


def test_wrapper_cancellation_cleans_workspace_and_releases_slot(tmp_path, monkeypatch):
    fake_worker(tmp_path, monkeypatch, "(root/'pid').write_text(str(os.getpid()))\ntime.sleep(20)\n")
    workspace = tmp_path / 'request'
    workspace.mkdir()
    monkeypatch.setattr(jobs.tempfile, 'mkdtemp', lambda **kwargs: str(workspace))
    async def exercise():
        task = asyncio.create_task(main.inspeccionar_tabla(file=UploadFile(io.BytesIO(b'a\n1\n'), filename='small.csv'), hoja=None))
        for _ in range(100):
            if (workspace / 'pid').exists():
                break
            await asyncio.sleep(0.01)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    asyncio.run(exercise())
    assert not workspace.exists()
    assert jobs.SLOTS.acquire(blocking=False)
    jobs.SLOTS.release()


def test_failed_download_still_cleans_workspace(tmp_path):
    path = tmp_path / 'download.txt'
    path.write_text('synthetic')
    response = jobs.JobFileResponse(path, workspace=tmp_path)
    async def send(message):
        raise RuntimeError('Synthetic disconnected client')
    with pytest.raises(RuntimeError):
        asyncio.run(response({'type':'http','method':'GET','headers':[]}, None, send))
    assert not tmp_path.exists()


def test_escaped_worker_output_is_not_served(tmp_path, monkeypatch):
    outside = tmp_path / 'outside'
    outside.write_text('synthetic')
    fake_worker(tmp_path, monkeypatch, "(root/'result.json').write_text(json.dumps({'kind':'file','path':'../outside','media_type':'text/plain','headers':{}}))\n")
    workspace = tmp_path / 'request'
    workspace.mkdir()
    monkeypatch.setattr(jobs.tempfile, 'mkdtemp', lambda **kwargs: str(workspace))
    with pytest.raises(HTTPException) as error:
        asyncio.run(main.convertir_formato(BackgroundTasks(), UploadFile(io.BytesIO(b'x'), filename='small.csv'),
            'geojson', '', '', None, 'puntos', '', 'GTM'))
    assert error.value.status_code == 422
    assert outside.read_text() == 'synthetic'
    assert not workspace.exists()


def test_table_and_geometry_budgets_are_applied_before_export(tmp_path, monkeypatch):
    monkeypatch.setattr(jobs, 'MAX_ROWS', 2)
    with pytest.raises(ValueError):
        main.parse_csv(b'lat,lon\n1,2\n3,4\n5,6\n')
    monkeypatch.setattr(jobs, 'MAX_ROWS', 100)
    monkeypatch.setattr(jobs, 'MAX_COLUMNS', 1)
    with pytest.raises(ValueError):
        jobs.validate_table_budget(pd.DataFrame({'a':[1],'b':[2]}))
    monkeypatch.setattr(jobs, 'MAX_COLUMNS', 256)
    monkeypatch.setattr(jobs, 'MAX_COORDINATES', 2)
    frame = gpd.GeoDataFrame(geometry=[LineString([(0,0),(1,1),(2,2)])], crs='EPSG:4326')
    with pytest.raises(ValueError):
        main.export_single_format(frame, tmp_path, 'geojson')
    assert not list(tmp_path.iterdir())


def test_kernel_resource_limits_in_real_subprocess():
    root = str(Path(__file__).resolve().parent.parent)
    code = '''import sys,resource,json
sys.path.insert(0,sys.argv[1])
from utils.conversion_jobs import apply_resource_limits
apply_resource_limits()
print(json.dumps([resource.getrlimit(x) for x in [resource.RLIMIT_CPU,resource.RLIMIT_AS,resource.RLIMIT_FSIZE,resource.RLIMIT_NOFILE,resource.RLIMIT_CORE]]))
'''
    result = subprocess.run([sys.executable,'-I','-c',code,root], capture_output=True, timeout=5, check=True)
    assert json.loads(result.stdout) == [[45,45],[384*1024**2,384*1024**2],[64*1024**2,64*1024**2],[128,128],[0,0]]


def test_table_inspection_executes_real_worker_and_cleans_temp(tmp_path, monkeypatch):
    workspace = tmp_path / 'request'
    workspace.mkdir()
    monkeypatch.setattr(jobs.tempfile, 'mkdtemp', lambda **kwargs: str(workspace))
    response = TestClient(main.app).post('/inspeccionar_tabla/', files={'file': ('small.csv', b'lat,lon\n14,-90\n')})
    assert response.status_code == 200, response.text
    assert response.json()['headers'] == ['lat','lon']
    assert not workspace.exists()


def test_health_responds_while_job_is_waiting(tmp_path, monkeypatch):
    fake_worker(tmp_path, monkeypatch, "time.sleep(20)\n")
    monkeypatch.setattr(jobs, 'JOB_TIMEOUT_SECONDS', 0.4)
    import httpx
    async def exercise():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://test') as client:
            # Prime the health probe; it runs outside the event loop in any case.
            assert (await client.get('/health')).status_code == 200
            conversion = asyncio.create_task(client.post('/inspeccionar_tabla/', files={'file': ('small.csv', b'a\n1\n')}))
            await asyncio.sleep(0.1)
            start = time.monotonic()
            assert (await client.get('/health')).status_code == 200
            assert time.monotonic() - start < 0.2
            busy = await client.post('/inspeccionar_tabla/', files={'file': ('small.csv', b'a\n1\n')})
            assert busy.status_code == 503 and busy.headers['Retry-After'] == '5'
            assert (await conversion).status_code == 504
    asyncio.run(exercise())
