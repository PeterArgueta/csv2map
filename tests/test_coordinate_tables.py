import io
import json

import geopandas as gpd
import pandas as pd
import pytest
from shapely.geometry import box

from main import enrich_administrative_points
from test_api import client


def convert(name, content, **data):
    return client.post('/convertir_formato/', files={'file': (name, content)},
                       data={'formato_salida': 'geojson', **data})


@pytest.mark.parametrize('lat,lon', [('lat', 'lon'), ('LATITUDE', 'LONGITUDE'),
    (' Latitud ', ' Longitud '), ('y', 'x'), ('lat', 'lng'),
    ('coord_lat', 'coord_lon'), ('Lat DD', 'Lon DD')])
def test_coordinate_aliases_and_municipal_attributes(lat, lon):
    response = convert('puntos.csv', f'{lat};{lon};nombre\n14.6349;-90.5069;Proyecto A\n'.encode(), tipo_geometria='puntos_admin', pais='GTM')
    assert response.status_code == 200, response.text
    feature = response.json()['features'][0]
    assert feature['geometry']['coordinates'] == [-90.5069, 14.6349]
    assert feature['properties']['codigo_municipio'] == '0101'
    assert feature['properties']['municipio'] == 'Guatemala'
    assert feature['properties']['codigo_departamento'] == '01'
    assert feature['properties']['departamento'] == 'Guatemala'
    assert feature['properties']['nombre'] == 'Proyecto A'


def test_excel_sheet_selection_and_custom_columns():
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
        pd.DataFrame({'nota': ['otra hoja']}).to_excel(writer, sheet_name='Portada', index=False)
        pd.DataFrame({'norte': ['14,6349'], 'este': ['-90,5069'],
                      'municipio': ['dato original'], 'ctm_municipio': ['también original']}).to_excel(writer, sheet_name='Puntos', index=False)
    response = convert('puntos.xlsx', buffer.getvalue(), hoja='Puntos',
                       columna_latitud='norte', columna_longitud='este',
                       tipo_geometria='puntos_admin', pais='GTM')
    assert response.status_code == 200, response.text
    properties = response.json()['features'][0]['properties']
    assert properties['municipio'] == 'dato original'
    assert properties['ctm_municipio'] == 'también original'
    assert properties['ctm_ctm_municipio'] == 'Guatemala'


def test_outside_points_preserved():
    response = convert('puntos.csv', b'lat,lon,nombre\n0,0,Fuera\n14.6349,-90.5069,Dentro\n', tipo_geometria='puntos_admin', pais='GTM')
    assert response.status_code == 200, response.text
    features = response.json()['features']
    assert len(features) == 2
    assert features[0]['properties']['estado_territorial'] == 'fuera_de_capa'
    assert features[0]['properties']['municipio'] == ''
    assert features[1]['properties']['estado_territorial'] == 'asignado'


@pytest.mark.parametrize('row', ['91,-90', '14,-181', ',0', 'texto,0', 'inf,0'])
def test_invalid_coordinates_rejected(row):
    response = convert('puntos.csv', f'lat,lon\n{row}\n'.encode())
    assert response.status_code == 422


def test_missing_explicit_column_rejected():
    response = convert('puntos.csv', b'lat,lon\n14,-90\n', columna_latitud='no_existe')
    assert response.status_code == 422


def test_plain_points_do_not_add_country_specific_attributes():
    response = convert('puntos.csv', b'lat,lon,nombre\n14.6349,-90.5069,Dentro\n',
                       tipo_geometria='puntos')
    assert response.status_code == 200, response.text
    properties = response.json()['features'][0]['properties']
    assert properties['nombre'] == 'Dentro'
    assert 'municipio' not in properties
    assert 'estado_territorial' not in properties


def test_shared_boundary_keeps_one_point_without_arbitrary_assignment(monkeypatch):
    territories = gpd.GeoDataFrame({
        'admin_code': ['0101', '0102'],
        'name': ['Uno', 'Dos'],
        'parent_code': ['01', '01'],
        'parent_name': ['Guatemala', 'Guatemala'],
    }, geometry=[box(0, 0, 1, 1), box(1, 0, 2, 1)], crs='EPSG:4326')
    monkeypatch.setattr('main.load_match_reference', lambda *args: territories)
    points = gpd.GeoDataFrame({'nombre': ['Limite']},
        geometry=gpd.points_from_xy([1], [0.5]), crs='EPSG:4326')
    result = enrich_administrative_points(points, 'GTM')
    assert len(result) == 1
    assert result.iloc[0]['estado_territorial'] == 'limite_ambiguo'
    assert result.iloc[0]['municipio'] == ''
