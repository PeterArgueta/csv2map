"""Security regressions use synthetic data, never private/network targets."""
import io
import asyncio
import json
import subprocess
import sys
import zipfile
import fiona
import pytest
from fastapi.testclient import TestClient
from fastapi import BackgroundTasks, HTTPException, UploadFile
from shapely.geometry import Point, mapping
import main
from utils import safe_gis

VRT = b'<OGRVRTDataSource><OGRVRTLayer name="fake"><SrcDataSource>synthetic.csv</SrcDataSource></OGRVRTLayer></OGRVRTDataSource>'
POINTS = {'type': 'FeatureCollection', 'features': [{'type': 'Feature', 'properties': {'name': 'synthetic'}, 'geometry': mapping(Point(-90, 14))}]}

@pytest.mark.parametrize('name,kind', [('fake.geojson','geojson'), ('fake.kml','kml'), ('fake.gpkg','gpkg'), ('fake.shp','shp')])
def test_disguised_vrt_rejected_before_gdal(tmp_path, monkeypatch, name, kind):
    path = tmp_path / name
    path.write_bytes(VRT)
    monkeypatch.setattr(safe_gis, '_run', lambda *args: pytest.fail('GDAL must not run'))
    with pytest.raises(ValueError):
        safe_gis.read_uploaded_layer(path, kind)

@pytest.mark.parametrize('route', ['/convertir_formato/', '/exportar_geojson/'])
def test_api_rejects_vrt_as_geojson(route):
    response = TestClient(main.app).post(route, files={'file': ('fake.geojson', VRT)}, data={'formato_salida': 'gpkg', 'formatos': 'geojson'})
    assert response.status_code == 422

def test_zip_disguised_shapefile_rejected():
    data = io.BytesIO()
    with zipfile.ZipFile(data, 'w') as archive:
        archive.writestr('fake.shp', VRT)
    response = TestClient(main.app).post('/convertir_formato/', files={'file': ('fake.zip', data.getvalue())}, data={'formato_salida': 'geojson'})
    assert response.status_code == 422

@pytest.mark.parametrize('content', [b'<!DOCTYPE kml [<!ENTITY x "synthetic">]><kml>&x;</kml>', b'<kml xmlns="http://www.opengis.net/kml/2.2"><NetworkLink><Link><href>https://example.invalid</href></Link></NetworkLink></kml>'])
def test_kml_rejects_dtd_and_networklinks(tmp_path, content):
    p = tmp_path / 'input.kml'
    p.write_bytes(content)
    with pytest.raises(ValueError):
        safe_gis.validate_content(p, 'kml')

def test_geojson_rejects_linked_crs(tmp_path):
    p = tmp_path / 'input.geojson'
    p.write_text(json.dumps({**POINTS, 'crs': {'type': 'link', 'properties': {'href': 'https://example.invalid'}}}))
    with pytest.raises(ValueError):
        safe_gis.validate_content(p, 'geojson')

def test_unavailable_sandbox_fails_closed(tmp_path, monkeypatch):
    p = tmp_path / 'input.geojson'
    p.write_text(json.dumps(POINTS))
    monkeypatch.setattr(safe_gis, 'isolation_available', lambda: False)
    monkeypatch.setattr(safe_gis, '_run', lambda *args: pytest.fail('No unsafe fallback'))
    with pytest.raises(safe_gis.GISIsolationUnavailable):
        safe_gis.read_uploaded_layer(p, 'geojson')
    # Worker-body unit test: parent monkeypatches cannot cross process boundaries.
    with pytest.raises(HTTPException) as error:
        asyncio.run(main.convertir_formato.__wrapped__(BackgroundTasks(),
            UploadFile(io.BytesIO(p.read_bytes()), filename='p.geojson'), 'gpkg',
            '', '', None, 'puntos', '', 'GTM'))
    assert error.value.status_code == 503

def test_worker_environment_and_timeout(tmp_path, monkeypatch):
    output = tmp_path / 'result.json'
    def fake_run(args, **kwargs):
        assert args[:2] == [sys.executable, '-I']
        assert kwargs['env'] == {'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8'}
        assert kwargs['close_fds'] and kwargs['timeout'] == 45
        assert 'shell' not in kwargs
        output.write_text('{"features": [], "crs_wkt": null}')
        return subprocess.CompletedProcess(args, 0)
    monkeypatch.setattr(safe_gis.subprocess, 'run', fake_run)
    assert safe_gis._run(tmp_path / 'input', output, 'geojson')['features'] == []

def test_worker_timeout_is_controlled(tmp_path, monkeypatch):
    def timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired('synthetic', 45)
    monkeypatch.setattr(safe_gis.subprocess, 'run', timeout)
    with pytest.raises(ValueError, match='tiempo'):
        safe_gis._run(tmp_path / 'input', tmp_path / 'output', 'geojson')

@pytest.mark.parametrize('driver,suffix,kind', [('GeoJSON','.geojson','geojson'), ('GPKG','.gpkg','gpkg'), ('ESRI Shapefile','.shp','shp'), ('KML','.kml','kml')])
def test_explicit_driver_roundtrip_without_kernel_test(tmp_path, driver, suffix, kind):
    # Fiona/worker compatibility only, NOT verification of kernel isolation.
    path = tmp_path / ('input' + suffix)
    with fiona.open(path, 'w', driver=driver, allow_unsupported_drivers=True, crs='EPSG:4326', schema={'geometry':'Point','properties':{'name':'str'}}) as c:
        c.write({'geometry':mapping(Point(-90,14)), 'properties':{'name':'synthetic'}})
    safe_gis.validate_content(path, kind)
    code = '''import sys,runpy
from pathlib import Path
sys.path.insert(0,str(Path(sys.argv[1]).parent))
import gis_sandbox
gis_sandbox.restrict_reader=lambda *args: None
worker=sys.argv.pop(1)
runpy.run_path(worker,run_name='__main__')
'''
    output = tmp_path / 'result.json'
    result = subprocess.run([sys.executable,'-I','-c',code,str(safe_gis.WORKER),str(path),str(output),kind], capture_output=True, timeout=45)
    assert result.returncode == 0, result.stderr.decode()
    payload = json.loads(output.read_text())
    assert not payload.get('invalid_file')
    assert len(payload['features']) == 1

def test_fiona_allowlist_rejects_vrt_even_without_content_check(tmp_path):
    path = tmp_path / 'fake.geojson'
    path.write_bytes(VRT)
    with pytest.raises(fiona.errors.DriverError):
        with fiona.open(path, enabled_drivers=['GeoJSON']):
            pytest.fail('VRT must not open')

@pytest.mark.skipif(not safe_gis.isolation_available(), reason='Kernel sandbox unavailable; required on deployment target')
@pytest.mark.parametrize('driver,suffix,kind', [('GeoJSON','.geojson','geojson'), ('GPKG','.gpkg','gpkg'), ('ESRI Shapefile','.shp','shp'), ('KML','.kml','kml')])
def test_real_kernel_isolation_and_valid_read(tmp_path, driver, suffix, kind):
    path = tmp_path / ('input' + suffix)
    with fiona.open(path, 'w', driver=driver, allow_unsupported_drivers=True, crs='EPSG:4326', schema={'geometry':'Point','properties':{'name':'str'}}) as c:
        c.write({'geometry':mapping(Point(-90,14)), 'properties':{'name':'synthetic'}})
    result = subprocess.run([sys.executable, '-I', str(safe_gis.WORKER), str(path), str(tmp_path / 'diagnostic.json'), kind], capture_output=True, timeout=45, env={'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8'}, cwd=tmp_path)
    assert result.returncode == 0, (result.returncode, result.stderr.decode()[:2000])
    frame = safe_gis.read_uploaded_layer(path, kind)
    assert len(frame) == 1
    assert frame.geometry.iloc[0].x == pytest.approx(-90)
