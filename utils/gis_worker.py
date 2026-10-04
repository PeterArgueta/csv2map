"""Read a single uploaded dataset under kernel restrictions; emit JSON only."""
import json
import os
from pathlib import Path
import socket
import sys

# -I deliberately omits the script directory; import only this trusted helper.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from gis_sandbox import restrict_reader
import fiona
from fiona.model import to_dict

DRIVERS = {'geojson': 'GeoJSON', 'kml': 'KML', 'gpkg': 'GPKG', 'shp': 'ESRI Shapefile'}


def run():
    source, output, kind = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve(), sys.argv[3]
    # The one writable descriptor is opened before lockdown, inside the workspace.
    with output.open('w', encoding='utf-8') as result:
        try:
            restrict_reader(source.parent, [sys.prefix, sys.base_prefix, '/usr/lib', '/lib',
                                            '/lib64', '/usr/share/proj', '/usr/share/gdal', '/dev/urandom'])
        except Exception:
            json.dump({'isolation_error': True}, result)
            return
        if kind == 'probe':
            # Verify actual enforcement, not just successful syscall returns.
            blocked = 0
            try:
                Path(sys.argv[4]).read_bytes()
            except PermissionError:
                blocked += 1
            try:
                socket.socket()
            except PermissionError:
                blocked += 1
            try:
                (source.parent / 'write_probe').write_text('synthetic')
            except PermissionError:
                blocked += 1
            json.dump({'isolated': blocked == 3}, result)
            return
        try:
            driver = DRIVERS[kind]
            with fiona.Env(GDAL_DRIVER_PATH='disable', GDAL_VRT_ENABLE_PYTHON='NO',
                           PROJ_NETWORK='OFF', OGR_SQLITE_LOAD_EXTENSIONS='NO'):
                with fiona.open(source, enabled_drivers=[driver],
                                allow_unsupported_drivers=True) as collection:
                    if collection.driver != driver:
                        raise ValueError('Unexpected driver')
                    payload = {'features': [], 'crs_wkt': collection.crs_wkt or None}
                    for feature in collection:
                        if len(payload['features']) >= 100000:
                            raise ValueError('Too many features')
                        payload['features'].append(to_dict(feature))
                    json.dump(payload, result, ensure_ascii=False, allow_nan=False)
        except Exception:
            result.seek(0)
            result.truncate()
            json.dump({'invalid_file': True}, result)


if __name__ == '__main__':
    run()
