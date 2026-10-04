"""Async admission and supervision of bounded, disposable conversion processes."""
import asyncio
from functools import wraps
import inspect
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time

from fastapi import HTTPException
from fastapi.responses import FileResponse

MAX_INPUT_BYTES = 10 * 1024**2
MAX_RESULT_BYTES = 1024**2
MAX_OUTPUT_BYTES = 64 * 1024**2
MAX_WORKSPACE_BYTES = 128 * 1024**2
JOB_TIMEOUT_SECONDS = 90
POLL_SECONDS = 0.1
CPU_SECONDS = 45
MEMORY_BYTES = 384 * 1024**2
MAX_ROWS = 100000
MAX_COLUMNS = 256
MAX_COORDINATES = 1000000
WORKER = Path(__file__).with_name('conversion_worker.py')
SLOTS = threading.BoundedSemaphore(1)
WORKER_ENV = {'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'OPENBLAS_NUM_THREADS': '1',
              'OMP_NUM_THREADS': '1', 'MALLOC_ARENA_MAX': '1',
              'GDAL_HTTP_TIMEOUT': '15', 'GDAL_HTTP_MAX_RETRY': '0'}


class JobFileResponse(FileResponse):
    def __init__(self, *args, workspace, **kwargs):
        super().__init__(*args, **kwargs)
        self.workspace = workspace

    async def __call__(self, scope, receive, send):
        try:
            await super().__call__(scope, receive, send)
        finally:
            # Also clean up if a client disconnects during the download.
            await asyncio.to_thread(shutil.rmtree, self.workspace, ignore_errors=True)


def workspace_size(workspace):
    return sum(p.stat().st_size for p in workspace.rglob('*') if p.is_file())


def _kill_group(process):
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


async def supervise(workspace, job_name):
    process = None
    started = time.monotonic()
    try:
        spawning = asyncio.create_task(asyncio.create_subprocess_exec(
            sys.executable, '-I', str(WORKER), str(workspace), job_name,
            cwd=workspace, env=WORKER_ENV.copy(), start_new_session=True,
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            close_fds=True,
        ))
        try:
            process = await asyncio.shield(spawning)
        except asyncio.CancelledError:
            # Cancellation during spawn must not leave an untracked process.
            process = await spawning
            raise
        while process.returncode is None:
            if time.monotonic() - started >= JOB_TIMEOUT_SECONDS:
                raise HTTPException(504, 'La conversión excedió el tiempo permitido. Reduce el archivo e inténtalo nuevamente.')
            if await asyncio.to_thread(workspace_size, workspace) > MAX_WORKSPACE_BYTES:
                raise HTTPException(422, 'La conversión excedió el espacio temporal permitido.')
            try:
                await asyncio.wait_for(process.wait(), timeout=POLL_SECONDS)
            except asyncio.TimeoutError:
                pass
        if process.returncode != 0:
            raise HTTPException(422, 'La conversión no pudo completarse dentro de los límites de recursos.')
        result_path = workspace / 'result.json'
        if not result_path.is_file() or result_path.stat().st_size > MAX_RESULT_BYTES:
            raise HTTPException(422, 'El resultado de la conversión supera los límites permitidos.')
        if await asyncio.to_thread(workspace_size, workspace) > MAX_WORKSPACE_BYTES:
            raise HTTPException(422, 'La conversión excedió el espacio temporal permitido.')
        return json.loads(await asyncio.to_thread(result_path.read_text, encoding='utf-8'))
    except (OSError, ValueError) as exc:
        raise HTTPException(503, 'El servicio de conversión segura no está disponible temporalmente.') from exc
    finally:
        if process is not None:
            # Kill descendants as well, including CTM-01's GIS reader on timeout.
            _kill_group(process)
            await process.wait()


def _prepare(workspace, content, filename, parameters):
    (workspace / 'input.bin').write_bytes(content)
    (workspace / 'job.json').write_text(json.dumps({'filename': filename, 'parameters': parameters}), encoding='utf-8')


def isolated_conversion(job_name):
    """Keep FastAPI's original endpoint signature, execute its body in a worker."""
    def decorate(function):
        signature = inspect.signature(function)
        @wraps(function)
        async def wrapper(*args, **kwargs):
            bound = signature.bind(*args, **kwargs)
            bound.apply_defaults()
            values = dict(bound.arguments)
            upload = values.pop('file')
            background_tasks = values.pop('background_tasks', None)
            if not SLOTS.acquire(blocking=False):
                raise HTTPException(503, 'Hay una conversión en curso. Inténtalo nuevamente en unos segundos.', headers={'Retry-After': '5'})
            workspace = None
            complete = False
            try:
                content = await upload.read(MAX_INPUT_BYTES + 1)
                if len(content) > MAX_INPUT_BYTES:
                    raise HTTPException(413, 'El archivo supera el límite de 10 MB.')
                if not content:
                    raise HTTPException(400, 'El archivo está vacío.')
                if not upload.filename or len(upload.filename) > 255:
                    raise HTTPException(400, 'Debes cargar un archivo con un nombre válido.')
                workspace = Path(tempfile.mkdtemp(prefix='ctm_job_'))
                await asyncio.to_thread(_prepare, workspace, content, upload.filename, values)
                result = await supervise(workspace, job_name)
                if 'error' in result:
                    raise HTTPException(result['status'], result['error'])
                if result.get('kind') == 'json':
                    return result['data']
                if result.get('kind') != 'file' or background_tasks is None:
                    raise HTTPException(503, 'El servicio de conversión no devolvió un resultado válido.')
                output = (workspace / result['path']).resolve()
                if (not output.is_relative_to(workspace.resolve()) or not output.is_file()
                        or output.stat().st_size > MAX_OUTPUT_BYTES):
                    raise HTTPException(422, 'El archivo generado supera los límites permitidos.')
                background_tasks.add_task(shutil.rmtree, workspace, ignore_errors=True)
                complete = True
                return JobFileResponse(output, filename=output.name, media_type=result['media_type'],
                                       headers=result['headers'], background=background_tasks, workspace=workspace)
            finally:
                try:
                    if workspace is not None and not complete:
                        await asyncio.to_thread(shutil.rmtree, workspace, ignore_errors=True)
                finally:
                    SLOTS.release()
        # Annotation strings must resolve against the endpoint's module, not here.
        wrapper.__signature__ = signature.replace(parameters=[
            p.replace(annotation=inspect.get_annotations(function, eval_str=True).get(p.name, p.annotation))
            for p in signature.parameters.values()])
        return wrapper
    return decorate


def validate_table_budget(frame):
    if len(frame) > MAX_ROWS or len(frame.columns) > MAX_COLUMNS:
        raise ValueError('La tabla supera el límite de 100000 filas o 256 columnas.')


def validate_layer_budget(frame):
    from shapely import get_num_coordinates
    validate_table_budget(frame)
    if int(get_num_coordinates(frame.geometry.array).sum()) > MAX_COORDINATES:
        raise ValueError('La capa supera el límite de 1000000 coordenadas.')


def apply_resource_limits():
    import resource
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_CPU, (CPU_SECONDS, CPU_SECONDS))
    resource.setrlimit(resource.RLIMIT_AS, (MEMORY_BYTES, MEMORY_BYTES))
    resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_OUTPUT_BYTES, MAX_OUTPUT_BYTES))
    resource.setrlimit(resource.RLIMIT_NOFILE, (128, 128))
