import io
import json
import zipfile

from fastapi.testclient import TestClient

from main import app, load_layer


client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_base_layers_are_complete():
    assert len(load_layer("GTM", "departamentos")) == 22
    assert len(load_layer("GTM", "municipios")) == 340
    assert len(load_layer("SLV", "departamentos")) == 14


def test_department_csv_exports_selected_formats():
    csv = (
        "codigo_departamento;valor;nota\n"
        "01;12;Guatemala\n"
        "03;8;Sacatepéquez\n"
        "99;1;No existe\n"
    ).encode("cp1252")
    response = client.post(
        "/procesar_csv/",
        files={"file": ("datos.csv", csv, "text/csv")},
        data={
            "pais": "GTM",
            "nivel": "departamentos",
            "columna_codigo": "codigo_departamento",
            "formatos": "shp,kml,geojson,gpkg",
        },
    )

    assert response.status_code == 200
    assert response.headers["x-matched-count"] == "2"
    assert response.headers["x-unmatched-count"] == "1"

    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        extensions = {"." + name.rsplit(".", 1)[-1] for name in archive.namelist()}
        assert {".shp", ".kml", ".geojson", ".gpkg", ".json"}.issubset(extensions)


def test_rejects_unknown_codes():
    response = client.post(
        "/procesar_csv/",
        files={"file": ("datos.csv", b"codigo_departamento\n99\n", "text/csv")},
        data={
            "pais": "GTM",
            "nivel": "departamentos",
            "columna_codigo": "codigo_departamento",
            "formatos": "geojson",
        },
    )
    assert response.status_code == 422
    assert "Ningún código" in response.json()["detail"]


def test_el_salvador_department_csv_exports_geojson():
    csv = (
        "codigo_departamento,valor,nombre\n"
        "01,12,Ahuachapán\n"
        "06,8,San Salvador\n"
        "99,1,No existe\n"
    ).encode("utf-8")
    response = client.post(
        "/procesar_csv/",
        files={"file": ("datos.csv", csv, "text/csv")},
        data={
            "pais": "SLV",
            "nivel": "departamentos",
            "columna_codigo": "codigo_departamento",
            "formatos": "geojson",
        },
    )

    assert response.status_code == 200
    assert response.headers["x-matched-count"] == "2"
    assert response.headers["x-unmatched-count"] == "1"

    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        report_name = next(name for name in archive.namelist() if name.endswith(".json") and "reporte" in name)
        report = archive.read(report_name).decode("utf-8")
        assert '"pais_codigo": "SLV"' in report


def test_catalog_exposes_only_supported_georeference_layers_to_api():
    from main import LAYERS

    assert set(LAYERS["GTM"]) == {"departamentos", "municipios"}
    assert "rutas_registradas_dgc" not in LAYERS["GTM"]
    assert "belice_diferendo" not in LAYERS["GTM"]


def test_create_layer_export_preserves_territorial_source():
    geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [-90.5, 14.63]},
                "properties": {"codigo_departamento": "01", "departamento": "Guatemala"},
            }
        ],
    }
    response = client.post(
        "/exportar_geojson/",
        files={"file": ("puntos.geojson", json.dumps(geojson).encode("utf-8"), "application/geo+json")},
        data={"formatos": "geojson", "pais": "GTM", "nivel": "departamentos"},
    )
    assert response.status_code == 200

    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        metadata = json.loads(archive.read("metadata.json").decode("utf-8"))
        assert metadata["pais_codigo"] == "GTM"
        assert metadata["nivel"] == "departamentos"
        assert metadata["territorial_source"] == "IDEG · SEGEPLAN"


def test_universal_converter_csv_to_geojson():
    csv = b"latitud,longitud,nombre\n14.6349,-90.5069,Guatemala\n"
    response = client.post(
        "/convertir_formato/",
        files={"file": ("puntos.csv", csv, "text/csv")},
        data={
            "formato_salida": "geojson",
            "columna_latitud": "latitud",
            "columna_longitud": "longitud",
        },
    )
    assert response.status_code == 200
    assert response.headers["x-source-format"] == "csv"
    assert response.headers["x-feature-count"] == "1"
    payload = json.loads(response.content.decode("utf-8"))
    assert len(payload["features"]) == 1
