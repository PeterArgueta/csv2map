"""Trusted job dispatcher. No shell, inherited secrets, pickle or user imports."""
import asyncio
import json
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from utils.conversion_jobs import apply_resource_limits, MAX_INPUT_BYTES

# Limits apply before pandas/GDAL imports and are inherited by child processes.
apply_resource_limits()

from fastapi import BackgroundTasks, HTTPException, UploadFile
from fastapi.responses import FileResponse
import main

JOBS = {name: getattr(main, name).__wrapped__ for name in
        ('exportar_geojson', 'convertir_formato', 'inspeccionar_tabla', 'procesar_csv')}


async def run(workspace, job_name):
    tempfile.tempdir = str(workspace)
    request = json.loads((workspace / 'job.json').read_text(encoding='utf-8'))
    # Use the real spool type so UploadFile recognizes in-memory reads. A bare
    # BytesIO is treated as a disk upload and starts an unnecessary thread pool
    # (including glibc arena/stack reservations) under the virtual-memory quota.
    source = tempfile.SpooledTemporaryFile(max_size=MAX_INPUT_BYTES + 1)
    source.write((workspace / 'input.bin').read_bytes())
    source.seek(0)
    upload = UploadFile(source, filename=request['filename'])
    parameters = request['parameters']
    parameters['file'] = upload
    if job_name != 'inspeccionar_tabla':
        parameters['background_tasks'] = BackgroundTasks()
    try:
        response = await JOBS[job_name](**parameters)
        if isinstance(response, FileResponse):
            output = Path(response.path).resolve()
            if not output.is_relative_to(workspace) or not output.is_file():
                raise ValueError('Invalid worker output')
            return {'kind': 'file', 'path': str(output.relative_to(workspace)),
                    'media_type': response.media_type,
                    'headers': {k: v for k, v in response.headers.items() if k.lower().startswith('x-')}}
        return {'kind': 'json', 'data': response}
    except HTTPException as exc:
        return {'error': exc.detail, 'status': exc.status_code}
    except Exception:
        return {'error': 'No se pudo completar la conversión dentro de los límites de seguridad.', 'status': 422}
    finally:
        await upload.close()


if __name__ == '__main__':
    workspace = Path(sys.argv[1]).resolve()
    result = asyncio.run(run(workspace, sys.argv[2]))
    (workspace / 'result.json').write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
