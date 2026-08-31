import io
import zipfile

from fastapi.testclient import TestClient

from main import app, load_layer


client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_base_layers_are_complete():
    assert len(load_layer("departamentos")) == 22
    assert len(load_layer("municipios")) == 340


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
            "nivel": "departamentos",
            "columna_codigo": "codigo_departamento",
            "formatos": "geojson",
        },
    )
    assert response.status_code == 422
    assert "Ningún código" in response.json()["detail"]
