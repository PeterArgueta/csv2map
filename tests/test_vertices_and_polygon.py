import io
import zipfile

import geopandas as gpd
import pytest

from test_api import client


VERTICES = b'ID,Longitud,Latitud,nombre\n1,-91,14,A\n2,-90,14,B\n3,-90,15,C\n4,-91,15,D\n5,-91,14,Cierre\n'


@pytest.mark.parametrize('output', ['geojson', 'shp', 'kml', 'gpkg', 'csv'])
def test_both_layers_exported_without_municipal_lookup(output, tmp_path, monkeypatch):
    def forbidden(*args):
        raise AssertionError('Must not load municipality layers')
    monkeypatch.setattr('main.load_layer', forbidden)
    response = client.post('/convertir_formato/', files={'file': ('vertices.csv', VERTICES)},
        data={'tipo_geometria': 'puntos_poligono', 'formato_salida': output})
    assert response.status_code == 200, response.text
    assert response.headers['content-type'] == 'application/zip'
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        archive.extractall(tmp_path)
        names = archive.namelist()
    if output == 'csv':
        assert set(names) == {'vertices.csv', 'poligono.csv'}
        assert 'POLYGON' in (tmp_path / 'poligono.csv').read_text()
        assert 'municipio' not in (tmp_path / 'vertices.csv').read_text()
    else:
        points = gpd.read_file(tmp_path / f'vertices.{output}')
        polygon = gpd.read_file(tmp_path / f'poligono.{output}')
        assert len(points) == 5
        assert len(polygon) == 1
        assert set(points.geom_type) == {'Point'}
        assert polygon.geometry.iloc[0].geom_type == 'Polygon'
        assert polygon.geometry.iloc[0].is_valid
        assert 'municipio' not in points.columns
        assert 'departamento' not in polygon.columns
        assert 'nombre' in points.columns


@pytest.mark.parametrize('filename,content,expected', [
    ('coordenadas.csv', VERTICES, 'puntos_poligono'),
    ('puntos.csv', b'lat,lon\n14,-91\n15,-90\n', 'puntos'),
    ('poligono.csv', b'lat,lon\n14,-91\n14,-90\n15,-90\n', 'puntos_poligono'),
    ('datos.csv', b'vertice,lat,lon\n1,14,-91\n2,14,-90\n3,15,-90\n', 'puntos_poligono'),
])
def test_inspection_suggests_geometry(filename,content,expected):
    response = client.post('/inspeccionar_tabla/', files={'file': (filename, content)})
    assert response.status_code == 200, response.text
    assert response.json()['suggested_geometry'] == expected


def test_invalid_polygon_does_not_return_points_only():
    response = client.post('/convertir_formato/', files={'file': ('vertices.csv', b'lat,lon\n14,-91\n15,-90\n')},
        data={'tipo_geometria': 'puntos_poligono', 'formato_salida': 'geojson'})
    assert response.status_code == 422
