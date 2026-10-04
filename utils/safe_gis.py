"""Content checks and isolated reading for user-controlled GIS uploads."""
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
from functools import lru_cache

import geopandas as gpd
from pyproj import CRS
from defusedxml import ElementTree

WORKER = Path(__file__).with_name('gis_worker.py')


class GISIsolationUnavailable(RuntimeError):
    pass


def validate_content(path: Path, kind: str):
    content = path.read_bytes()
    try:
        if kind == 'geojson':
            data = json.loads(content.decode('utf-8-sig'))
            if not isinstance(data, dict) or data.get('type') not in {'FeatureCollection', 'Feature'}:
                raise ValueError()
            features = data.get('features') if data['type'] == 'FeatureCollection' else [data]
            if not isinstance(features, list):
                raise ValueError()
            # Legacy linked CRS may direct a parser to an external resource.
            if data.get('crs'):
                crs = data['crs']
                if not isinstance(crs, dict) or crs.get('type') != 'name':
                    raise ValueError()
                name = crs.get('properties', {}).get('name', '')
                if not isinstance(name, str) or not (name.upper().startswith('EPSG:') or name.startswith('urn:ogc:def:crs:') or name == 'OGC:CRS84'):
                    raise ValueError()
            for feature in features:
                if not isinstance(feature, dict) or feature.get('type') != 'Feature':
                    raise ValueError()
        elif kind == 'kml':
            root = ElementTree.fromstring(content, forbid_dtd=True, forbid_entities=True, forbid_external=True)
            if root.tag not in {'kml', '{http://www.opengis.net/kml/2.2}kml', '{http://earth.google.com/kml/2.1}kml', '{http://earth.google.com/kml/2.0}kml'}:
                raise ValueError()
            if any(node.tag.rsplit('}', 1)[-1] in {'NetworkLink', 'NetworkLinkControl'} for node in root.iter()):
                raise ValueError()
        elif kind == 'gpkg':
            if not content.startswith(b'SQLite format 3\x00') or len(content) < 100 or content[68:72] != b'GPKG':
                raise ValueError()
        elif kind == 'shp':
            if len(content) < 100 or struct.unpack('>I', content[:4])[0] != 9994 or struct.unpack('<I', content[28:32])[0] != 1000:
                raise ValueError()
        else:
            raise ValueError()
    except (ValueError, TypeError, AttributeError, RecursionError, ElementTree.ParseError) as exc:
        raise ValueError('El contenido no corresponde al formato GIS permitido o contiene referencias externas.') from exc
    except Exception as exc:
        # Includes defusedxml's DTD/entity exceptions; no parser detail leaks.
        raise ValueError('El contenido GIS contiene XML o referencias no permitidas.') from exc


def _run(source, output, kind, *extra):
    try:
        completed = subprocess.run(
            [sys.executable, '-I', str(WORKER), str(source), str(output), kind, *map(str, extra)],
            cwd=source.parent, env={'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8'},
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            timeout=45, check=False, close_fds=True,
        )
    except subprocess.TimeoutExpired as exc:
        raise ValueError('La lectura GIS excedió el tiempo permitido.') from exc
    if completed.returncode != 0 or not output.exists() or output.stat().st_size > 64 * 1024**2:
        raise ValueError('No fue posible leer el archivo GIS dentro de los límites de seguridad.')
    try:
        payload = json.loads(output.read_text(encoding='utf-8'))
    except (ValueError, OSError) as exc:
        raise ValueError('El lector GIS no devolvió un resultado válido.') from exc
    if payload.get('isolation_error'):
        raise GISIsolationUnavailable('El servidor no permite activar el aislamiento GIS.')
    return payload


@lru_cache(maxsize=1)
def isolation_available():
    try:
        with tempfile.TemporaryDirectory(prefix='ctm_probe_') as directory:
            root = Path(directory)
            secret = root / 'sentinel.txt'
            secret.write_text('synthetic probe')
            inputs = root / 'input'
            inputs.mkdir()
            payload = _run(inputs / 'probe', root / 'result.json', 'probe', secret)
            return payload.get('isolated') is True
    except (ValueError, GISIsolationUnavailable, OSError):
        return False


def read_uploaded_layer(path: Path, kind: str):
    validate_content(path, kind)
    if not isolation_available():
        raise GISIsolationUnavailable('El servidor no permite activar el aislamiento GIS.')
    output = path.parent / 'isolated_result.json'
    try:
        payload = _run(path, output, kind)
        if payload.get('invalid_file'):
            raise ValueError('No fue posible abrir el archivo con el driver GIS permitido.')
        features = payload.get('features')
        if not isinstance(features, list):
            raise ValueError('El lector GIS devolvió datos no válidos.')
        crs = CRS.from_wkt(payload['crs_wkt']) if payload.get('crs_wkt') else None
        return gpd.GeoDataFrame.from_features(features, crs=crs)
    finally:
        output.unlink(missing_ok=True)
