"""Small synthetic ZIPs and reduced test quotas; never generate ZIP bombs."""
import io
import stat
import struct
import zipfile

import fiona
import pytest
from fastapi.testclient import TestClient
from shapely.geometry import Point, mapping

import main
from utils import safe_gis, safe_zip


def archive_bytes(entries=None, compression=zipfile.ZIP_STORED):
    entries = entries or [('sample.shp', b'shp'), ('sample.shx', b'shx'), ('sample.dbf', b'dbf')]
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', compression=compression) as archive:
        for name, data in entries:
            archive.writestr(name, data)
    return out.getvalue()


def assert_preflight_rejected(tmp_path, content):
    destination = tmp_path / 'output'
    with pytest.raises(ValueError):
        safe_zip.extract_shapefile(content, destination)
    assert not destination.exists()


def test_complete_shapefile_with_nested_uppercase_names(tmp_path):
    content = archive_bytes([('Folder/', b''), ('Folder/NAME.SHP', b'shp'),
                             ('Folder/NAME.SHX', b'shx'), ('Folder/NAME.DBF', b'dbf'),
                             ('Folder/NAME.PRJ', b'prj'), ('Folder/NAME.CPG', b'UTF-8')])
    path = safe_zip.extract_shapefile(content, tmp_path / 'output')
    assert path.read_bytes() == b'shp'
    assert sorted(p.name for p in path.parent.iterdir()) == ['layer.cpg', 'layer.dbf', 'layer.prj', 'layer.shp', 'layer.shx']


@pytest.mark.parametrize('name', ['../escape.shp', '/absolute.shp', 'C:/drive.shp',
                                  'dir\\file.shp', 'dir/../file.shp', 'dir//file.shp', './file.shp', 'control\n.shp'])
def test_unsafe_paths_rejected_before_writes(tmp_path, name):
    assert_preflight_rejected(tmp_path, archive_bytes([(name, b'x')]))


@pytest.mark.parametrize('mode', [stat.S_IFLNK, stat.S_IFIFO, stat.S_IFCHR, stat.S_IFBLK, stat.S_IFSOCK])
def test_links_and_special_files_rejected(tmp_path, mode):
    member = zipfile.ZipInfo('sample.shp')
    member.create_system = 3
    member.external_attr = (mode | 0o600) << 16
    assert_preflight_rejected(tmp_path, archive_bytes([(member, b'synthetic')]))


@pytest.mark.parametrize('extra', ['nested.zip', 'script.py', 'readme.txt', 'layer.shp.xml', 'second.shp', 'SAMPLE.SHP'])
def test_nonparts_multiple_datasets_and_duplicates_rejected(tmp_path, extra):
    assert_preflight_rejected(tmp_path, archive_bytes([('sample.shp', b'x'), ('sample.shx', b'x'), ('sample.dbf', b'x'), (extra, b'x')]))


def test_incomplete_and_invalid_archives(tmp_path):
    assert_preflight_rejected(tmp_path, archive_bytes([('sample.shp', b'x')]))
    assert_preflight_rejected(tmp_path, b'not-a-zip')


@pytest.mark.parametrize('quota,value', [('MAX_MEMBERS', 2), ('MAX_EXPANDED_BYTES', 8), ('MAX_MEMBER_BYTES', 2)])
def test_declared_quotas_preflight(tmp_path, monkeypatch, quota, value):
    monkeypatch.setattr(safe_zip, quota, value)
    assert_preflight_rejected(tmp_path, archive_bytes())


def test_compression_ratio_uses_small_fixture(tmp_path, monkeypatch):
    monkeypatch.setattr(safe_zip, 'MAX_COMPRESSION_RATIO', 2)
    content = archive_bytes([('sample.shp', b'0' * 128), ('sample.shx', b'x'), ('sample.dbf', b'x')], zipfile.ZIP_DEFLATED)
    assert_preflight_rejected(tmp_path, content)


def test_unsupported_compression(tmp_path):
    assert_preflight_rejected(tmp_path, archive_bytes(compression=zipfile.ZIP_BZIP2))


def test_encrypted_and_nul_names(tmp_path):
    for flag in ('encrypted', 'nul'):
        payload = bytearray(archive_bytes())
        offset = payload.index(b'PK\x01\x02')
        if flag == 'encrypted':
            struct.pack_into('<H', payload, offset + 8, 1)
        else:
            payload[offset + 46 + 2] = 0
        assert_preflight_rejected(tmp_path, bytes(payload))


def test_crc_failure_removes_partial_output(tmp_path):
    payload = bytearray(archive_bytes())
    name_length, extra_length = struct.unpack_from('<HH', payload, 26)
    payload[30 + name_length + extra_length] ^= 1
    assert_preflight_rejected(tmp_path, bytes(payload))


@pytest.mark.parametrize('quota,value', [('MAX_EXPANDED_BYTES', 5), ('MAX_MEMBER_BYTES', 2)])
def test_real_byte_quotas_even_if_preflight_is_bypassed(tmp_path, monkeypatch, quota, value):
    original = safe_zip._plan
    def plan_then_reduce(archive):
        plan = original(archive)
        monkeypatch.setattr(safe_zip, quota, value)
        return plan
    monkeypatch.setattr(safe_zip, '_plan', plan_then_reduce)
    assert_preflight_rejected(tmp_path, archive_bytes())


def test_stream_reads_are_bounded_and_detect_inconsistent_sizes(tmp_path, monkeypatch):
    class SyntheticReader(io.BytesIO):
        def read(self, n=-1):
            assert 0 < n <= safe_zip.CHUNK_BYTES
            return super().read(n)
    monkeypatch.setattr(zipfile.ZipFile, 'open', lambda *args, **kwargs: SyntheticReader(b'oversized'))
    assert_preflight_rejected(tmp_path, archive_bytes())


def test_existing_destination_is_not_touched(tmp_path):
    destination = tmp_path / 'output'
    destination.mkdir()
    sentinel = destination / 'sentinel'
    sentinel.write_text('keep')
    with pytest.raises(FileExistsError):
        safe_zip.extract_shapefile(archive_bytes(), destination)
    assert sentinel.read_text() == 'keep'


def test_api_rejection_removes_workspace_and_does_not_invoke_gdal(tmp_path, monkeypatch):
    workspace = tmp_path / 'request'
    workspace.mkdir()
    monkeypatch.setattr(main.tempfile, 'mkdtemp', lambda **kwargs: str(workspace))
    monkeypatch.setattr(main, 'read_uploaded_layer', lambda *args: pytest.fail('GDAL must not run'))
    response = TestClient(main.app).post('/convertir_formato/', files={'file': ('invalid.zip', archive_bytes([('nested.zip', b'synthetic')]))}, data={'formato_salida': 'geojson'})
    assert response.status_code == 422
    assert not workspace.exists()


@pytest.mark.skipif(not safe_gis.isolation_available(), reason='Requires real GIS kernel isolation')
def test_real_shapefile_zip_conversion(tmp_path):
    source = tmp_path / 'synthetic.shp'
    with fiona.open(source, 'w', driver='ESRI Shapefile', crs='EPSG:4326',
                    schema={'geometry': 'Point', 'properties': {'name': 'str'}}) as collection:
        collection.write({'geometry': mapping(Point(-90, 14)), 'properties': {'name': 'synthetic'}})
    content = archive_bytes([('Folder/' + p.name.upper(), p.read_bytes()) for p in tmp_path.iterdir()])
    response = TestClient(main.app).post('/convertir_formato/', files={'file': ('synthetic.zip', content)}, data={'formato_salida': 'geojson'})
    assert response.status_code == 200, response.text
    assert response.json()['features'][0]['properties']['name'] == 'synthetic'
