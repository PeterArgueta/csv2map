import io
import json
import zipfile

import geopandas as gpd
import pandas as pd
import pytest
from shapely.geometry import shape

from main import parse_coordinate
from test_api import client


def convert(content, filename='vertices.csv', **data):
    return client.post('/convertir_formato/', files={'file': (filename, content)},
        data={'tipo_geometria': 'poligono', 'formato_salida': 'geojson', **data})


def test_polygon_sorted_closed_and_without_properties_or_municipal_lookup(monkeypatch):
    def forbidden(*args):
        raise AssertionError('Polygon mode must never load municipalities')
    monkeypatch.setattr('main.load_layer', forbidden)
    response = convert(b'vertice,lat,lon,municipio\n3,15,-90,Ignorar\n1,14,-91,Ignorar\n4,15,-91,Ignorar\n2,14,-90,Ignorar\n')
    assert response.status_code == 200, response.text
    feature = response.json()['features'][0]
    assert feature['properties'] == {}
    assert feature['geometry']['type'] == 'Polygon'
    assert feature['geometry']['coordinates'][0] == [[-91,14],[-90,14],[-90,15],[-91,15],[-91,14]]


def test_excel_dms_norte_oeste_like_uploaded_image():
    rows = [
        (1, '14° 32′ 33,42″', '91° 28′ 09,40″'),
        (2, '14° 32′ 28,13″', '91° 28′ 10,22″'),
        (3, '14° 32′ 31,00″', '91° 28′ 21,94″'),
        (4, '14° 32′ 22,08″', '91° 28′ 22,08″'),
        (5, '14° 32′ 38,78″', '91° 28′ 24,48″'),
        (6, '14° 32′ 35,98″', '91° 28′ 20,30″'),
        (7, '14° 32′ 39,70″', '91° 28′ 19,38″'),
        (8, '14° 32′ 36,30″', '91° 28′ 14,50″'),
        (9, '14° 32′ 36,17″', '91° 28′ 14,12″'),
    ]
    buffer = io.BytesIO()
    pd.DataFrame(rows, columns=['Vértice','Norte','Oeste']).to_excel(buffer,index=False)
    response = convert(buffer.getvalue(), 'vertices.xlsx')
    assert response.status_code == 200, response.text
    feature = response.json()['features'][0]
    assert shape(feature['geometry']).is_valid
    assert len(feature['geometry']['coordinates'][0]) == 10
    assert feature['geometry']['coordinates'][0][0][0] == pytest.approx(-91.4692777778)
    assert feature['properties'] == {}


@pytest.mark.parametrize('text,axis,column,expected', [
    ('14°32\'33,42"', 'lat', 'Norte', 14.5426166667),
    ('91°28\'09.40" O', 'lon', 'lon', -91.4692777778),
    ('W 91°28\'09.40"', 'lon', 'lon', -91.4692777778),
    ('-90,5', 'lon', 'longitude', -90.5),
    ('91.5', 'lon', 'Oeste', -91.5),
])
def test_coordinate_formats(text,axis,column,expected):
    assert parse_coordinate(text,axis,column) == pytest.approx(expected)


@pytest.mark.parametrize('value,axis', [('14°60\'0"', 'lat'), ('91°0\'60"','lon'),
    ('91°0\'0"','lat'), ('-14 N','lat'), ('14 W','lat'), ('14°x32\'3"','lat')])
def test_invalid_dms_rejected(value,axis):
    with pytest.raises(ValueError):
        parse_coordinate(value,axis,'lat' if axis == 'lat' else 'lon')


@pytest.mark.parametrize('rows', [
    '14,-91\n15,-90\n',
    '14,-91\n15,-90\n16,-89\n',
    '14,-91\n15,-90\n14,-90\n15,-91\n',
    '14,-91\n14,-90\n15,-90\n14,-90\n15,-91\n',
])
def test_invalid_polygons_rejected(rows):
    response = convert(('lat,lon\n'+rows).encode())
    assert response.status_code == 422


def test_already_closed_ring_and_custom_order():
    response = convert(b'numero,lat,lon\n10,14,-91\n20,14,-90\n30,15,-90\n40,14,-91\n', columna_orden='numero')
    assert response.status_code == 200, response.text
    assert len(response.json()['features'][0]['geometry']['coordinates'][0]) == 4


def test_duplicate_vertex_numbers_rejected():
    response = convert(b'vertice,lat,lon\n1,14,-91\n1,14,-90\n3,15,-90\n')
    assert response.status_code == 422


@pytest.mark.parametrize('output', ['shp', 'kml', 'gpkg', 'csv'])
def test_polygon_output_formats(output,tmp_path):
    response = convert(b'lat,lon\n14,-91\n14,-90\n15,-90\n', formato_salida=output)
    assert response.status_code == 200, response.text
    if output == 'csv':
        assert 'POLYGON' in response.text
        assert 'municipio' not in response.text
    else:
        path = tmp_path / ('polygon.zip' if output == 'shp' else f'polygon.{output}')
        path.write_bytes(response.content)
        if output == 'shp':
            with zipfile.ZipFile(path) as archive:
                archive.extractall(tmp_path)
            path = next(tmp_path.glob('*.shp'))
        layer = gpd.read_file(path)
        assert len(layer) == 1
        assert layer.geometry.iloc[0].geom_type == 'Polygon'
        assert 'municipio' not in layer.columns
