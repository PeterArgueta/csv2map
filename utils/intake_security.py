"""Bound intake before multipart spooling and conversion, without proxy-header trust."""
import asyncio
import hashlib
import hmac
import ipaddress
import math
import secrets
import threading
import time

from fastapi import HTTPException
from fastapi.routing import APIRoute
from starlette.formparsers import MultiPartException, MultiPartParser
from starlette.responses import JSONResponse
from python_multipart.multipart import parse_options_header
from python_multipart.exceptions import MultipartParseError

PATHS = {'/procesar_csv', '/inspeccionar_tabla', '/convertir_formato', '/exportar_geojson'}
MAX_BODY_BYTES = 11 * 1024**2
MAX_FILE_BYTES = 10 * 1024**2
MAX_FIELDS = 10
MAX_FIELD_BYTES = 16 * 1024
MAX_PART_HEADER_BYTES = 8 * 1024
UPLOAD_SECONDS = 30
IDLE_SECONDS = 5
DOWNLOAD_SECONDS = 60
REQUEST_SECONDS = 180
MAX_IDENTITIES = 2048
IDENTITY_TTL_SECONDS = 300


class IntakeViolation(MultiPartException):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


class IntakeLimiter:
    """Token buckets: client 20/min, burst 10; process 60/min, burst 20."""
    def __init__(self):
        self.lock = threading.Lock()
        self.salt = secrets.token_bytes(32)
        self.clients = {}
        self.global_tokens = 20.0
        self.global_updated = time.monotonic()

    def identity(self, scope):
        try:
            address = ipaddress.ip_address(scope['client'][0])
            if address.version == 6 and address.ipv4_mapped:
                address = address.ipv4_mapped
            value = str(address) if address.version == 4 else str(ipaddress.ip_network(f'{address}/64', strict=False))
        except (ValueError, TypeError, KeyError):
            value = 'unknown-peer'
        # Raw IP addresses are not retained, logged, or returned.
        return hmac.new(self.salt, value.encode(), hashlib.sha256).digest()

    def allow(self, scope):
        key, now = self.identity(scope), time.monotonic()
        with self.lock:
            self.global_tokens = min(20.0, self.global_tokens + (now - self.global_updated))
            self.global_updated = now
            if self.global_tokens < 1:
                # Globally rejected traffic must not populate/evict identities.
                return False, max(1, math.ceil(1 - self.global_tokens))
            if key not in self.clients:
                self.clients = {k:v for k,v in self.clients.items() if now - v[1] < IDENTITY_TTL_SECONDS}
                if len(self.clients) >= MAX_IDENTITIES:
                    return False, 5
            tokens, updated = self.clients.get(key, (10.0, now))
            tokens = min(10.0, tokens + (now - updated) / 3)
            self.clients[key] = (tokens, now)
            if tokens < 1 or self.global_tokens < 1:
                wait = math.ceil(max((1 - tokens) * 3, 1 - self.global_tokens, 1))
                return False, wait
            self.clients[key] = (tokens - 1, now)
            self.global_tokens -= 1
            return True, 0


class IntakeMiddleware:
    def __init__(self, app, limiter):
        self.app, self.limiter = app, limiter
        self.slot = threading.BoundedSemaphore(1)

    async def reject(self, scope, receive, send, status, detail, retry=None):
        headers = {'Retry-After': str(retry)} if retry is not None else {}
        if scope.get('http_version', '1.1') in {'1.0', '1.1'}:
            headers['Connection'] = 'close'
        await JSONResponse({'detail': detail}, status_code=status, headers=headers)(scope, receive, send)

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope.get('method') != 'POST' or scope.get('path', '').rstrip('/') not in PATHS:
            return await self.app(scope, receive, send)
        allowed, retry = self.limiter.allow(scope)
        if not allowed:
            return await self.reject(scope, receive, send, 429, 'Demasiadas solicitudes. Inténtalo nuevamente en unos segundos.', retry)
        lengths = [v for k,v in scope.get('headers', []) if k.lower() == b'content-length']
        if lengths:
            if len(lengths) != 1 or not lengths[0] or len(lengths[0]) > 20 or any(c not in b'0123456789' for c in lengths[0]):
                return await self.reject(scope, receive, send, 400, 'Content-Length no válido.')
            if int(lengths[0]) > MAX_BODY_BYTES:
                return await self.reject(scope, receive, send, 413, 'La solicitud supera el límite de recepción de 11 MiB.')
        if not self.slot.acquire(blocking=False):
            return await self.reject(scope, receive, send, 503, 'Hay una carga o conversión en curso. Inténtalo nuevamente en unos segundos.', 5)
        started = time.monotonic()
        received = 0
        body_finished = False
        response_started = False
        response_time = None

        async def limited_receive():
            nonlocal received, body_finished
            if body_finished:
                # Response disconnect listeners are not upload inactivity.
                return await receive()
            remaining = UPLOAD_SECONDS - (time.monotonic() - started)
            if remaining <= 0:
                raise IntakeViolation(408, 'La carga excedió el tiempo permitido.')
            try:
                message = await asyncio.wait_for(receive(), timeout=min(IDLE_SECONDS, remaining))
            except asyncio.TimeoutError as exc:
                raise IntakeViolation(408, 'La carga excedió el tiempo permitido.') from exc
            if message['type'] == 'http.disconnect':
                raise IntakeViolation(400, 'La carga se interrumpió.')
            if message['type'] == 'http.request':
                received += len(message.get('body', b''))
                if received > MAX_BODY_BYTES:
                    raise IntakeViolation(413, 'La solicitud supera el límite de recepción de 11 MiB.')
                body_finished = not message.get('more_body', False)
            return message

        async def limited_send(message):
            nonlocal response_started, response_time
            if message['type'] == 'http.response.start':
                response_started, response_time = True, time.monotonic()
            if response_time is None:
                return await send(message)
            remaining = DOWNLOAD_SECONDS - (time.monotonic() - response_time)
            if remaining <= 0:
                raise asyncio.TimeoutError()
            await asyncio.wait_for(send(message), timeout=remaining)

        try:
            await asyncio.wait_for(self.app(scope, limited_receive, limited_send), timeout=REQUEST_SECONDS)
        except IntakeViolation as exc:
            if not response_started:
                await self.reject(scope, receive, send, exc.status, exc.message)
        except asyncio.TimeoutError:
            if not response_started:
                await self.reject(scope, receive, send, 408, 'La solicitud excedió el tiempo permitido.')
        finally:
            self.slot.release()


class LimitedMultiPartParser(MultiPartParser):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.finished = False

    def on_end(self):
        super().on_end()
        self.finished = True

    def on_part_begin(self):
        super().on_part_begin()
        self.part_header_bytes = self.part_file_bytes = 0

    def count_header(self, data, start, end):
        self.part_header_bytes += end - start
        if self.part_header_bytes > MAX_PART_HEADER_BYTES:
            raise IntakeViolation(413, 'Los encabezados multipart superan el límite permitido.')

    def on_header_field(self, data, start, end):
        self.count_header(data, start, end)
        super().on_header_field(data, start, end)

    def on_header_value(self, data, start, end):
        self.count_header(data, start, end)
        super().on_header_value(data, start, end)

    def on_part_data(self, data, start, end):
        if self._current_part.file is not None:
            self.part_file_bytes += end - start
            if self.part_file_bytes > MAX_FILE_BYTES:
                raise IntakeViolation(413, 'El archivo supera el límite de 10 MiB.')
        super().on_part_data(data, start, end)

    async def parse(self):
        try:
            form = await super().parse()
            if not self.finished:
                raise MultiPartException('Incomplete multipart.')
            return form
        except BaseException:
            # Older Starlette versions only close spools for MultiPartException.
            # Cover malformed data, stream errors, cancellation and disconnect.
            for file in self._files_to_close_on_error:
                file.close()
            raise


class IntakeRoute(APIRoute):
    def get_route_handler(self):
        original = super().get_route_handler()
        async def handler(request):
            if request.method != 'POST' or request.url.path.rstrip('/') not in PATHS:
                return await original(request)
            content_type = request.headers.get('content-type', '')
            media, options = parse_options_header(content_type)
            if media != b'multipart/form-data':
                raise HTTPException(415, 'La carga debe usar multipart/form-data.')
            if len(content_type) > 512 or len(options.get(b'boundary', b'')) > 70:
                raise HTTPException(400, 'El encabezado multipart no es válido.')
            parser = LimitedMultiPartParser(request.headers, request.stream(), max_files=1,
                                           max_fields=MAX_FIELDS, max_part_size=MAX_FIELD_BYTES)
            close_headers = {'Connection': 'close'} if request.scope.get('http_version', '1.1') in {'1.0', '1.1'} else None
            try:
                form = await parser.parse()
            except IntakeViolation as exc:
                raise HTTPException(exc.status, exc.message, headers=close_headers) from exc
            except (MultiPartException, MultipartParseError) as exc:
                raise HTTPException(400, 'El multipart supera sus límites o tiene una estructura no válida.', headers=close_headers) from exc
            request._form = form
            try:
                return await original(request)
            finally:
                await form.close()
                for file in parser._files_to_close_on_error:
                    file.close()
        return handler
