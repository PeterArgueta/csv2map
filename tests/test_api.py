import io
import json
import zipfile

from fastapi.testclient import TestClient

from main import LAYERS, app, load_layer


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
    assert "Ningún nombre o ID" in response.json()["detail"]


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


def _first_valid_code(pais: str, nivel: str) -> str:
    config = LAYERS[pais][nivel]
    layer = load_layer(pais, nivel)
    values = layer[config["code_field"]].astype(str).tolist()
    for value in values:
        digits = "".join(char for char in value if char.isdigit())
        if digits:
            return digits.zfill(config["code_width"])
    raise AssertionError(f"No valid administrative code found for {pais}/{nivel}")


def test_smoke_georeference_all_supported_countries():
    cases = [
        ("GTM", "departamentos"),
        ("GTM", "municipios"),
        ("BLZ", "distritos"),
        ("SLV", "departamentos"),
        ("HND", "departamentos"),
        ("NIC", "departamentos_regiones"),
        ("CRI", "provincias"),
        ("PAN", "provincias_comarcas"),
        ("MEX", "estados"),
    ]

    for pais, nivel in cases:
        code = _first_valid_code(pais, nivel)
        csv = f"codigo,valor\n{code},1\n".encode("utf-8")
        response = client.post(
            "/procesar_csv/",
            files={"file": ("smoke.csv", csv, "text/csv")},
            data={
                "pais": pais,
                "nivel": nivel,
                "columna_codigo": "codigo",
                "formatos": "geojson",
            },
        )
        assert response.status_code == 200, (
            pais,
            nivel,
            response.text,
        )
        assert response.headers["x-matched-count"] == "1"

        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            names = archive.namelist()
            assert any(name.endswith(".geojson") for name in names)
            report_name = next(name for name in names if "reporte" in name and name.endswith(".json"))
            report = json.loads(archive.read(report_name).decode("utf-8"))
            assert report["pais_codigo"] == pais
            assert report["nivel"] == nivel


def test_smoke_create_layer_export_all_supported_countries():
    cases = [
        ("GTM", "departamentos"),
        ("GTM", "municipios"),
        ("BLZ", "distritos"),
        ("SLV", "departamentos"),
        ("HND", "departamentos"),
        ("NIC", "departamentos_regiones"),
        ("CRI", "provincias"),
        ("PAN", "provincias_comarcas"),
        ("MEX", "estados"),
    ]
    geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [-90.5, 14.63]},
                "properties": {"nombre": "Punto de prueba"},
            }
        ],
    }

    for pais, nivel in cases:
        response = client.post(
            "/exportar_geojson/",
            files={
                "file": (
                    "puntos.geojson",
                    json.dumps(geojson).encode("utf-8"),
                    "application/geo+json",
                )
            },
            data={
                "formatos": "geojson",
                "pais": pais,
                "nivel": nivel,
            },
        )
        assert response.status_code == 200, (pais, nivel, response.text)
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            metadata = json.loads(archive.read("metadata.json").decode("utf-8"))
            assert metadata["pais_codigo"] == pais
            assert metadata["nivel"] == nivel
            assert metadata["features"] == 1

def _xlsx_bytes(rows, sheet_name="Datos"):
    import pandas as pd

    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        pd.DataFrame(rows).to_excel(writer, index=False, sheet_name=sheet_name)
    return buffer.getvalue()


def test_inspect_excel_returns_headers_preview_and_sheets():
    content = _xlsx_bytes(
        [
            {"departamento": "Guatemala", "valor": 10},
            {"departamento": "Sacatepéquez", "valor": 20},
        ],
        sheet_name="Mapa",
    )
    response = client.post(
        "/inspeccionar_tabla/",
        files={
            "file": (
                "datos.xlsx",
                content,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["format"] == "xlsx"
    assert payload["sheet_name"] == "Mapa"
    assert payload["sheet_names"] == ["Mapa"]
    assert payload["headers"] == ["departamento", "valor"]
    assert payload["rows"][0]["departamento"] == "Guatemala"


def test_excel_department_names_are_georeferenced():
    content = _xlsx_bytes(
        [
            {"departamento": "Guatemala", "valor": 10},
            {"departamento": "Sacatepequez", "valor": 20},
        ]
    )
    response = client.post(
        "/procesar_csv/",
        files={
            "file": (
                "departamentos.xlsx",
                content,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
        data={
            "pais": "GTM",
            "nivel": "departamentos",
            "columna_codigo": "departamento",
            "formatos": "geojson",
        },
    )
    assert response.status_code == 200, response.text
    assert response.headers["x-matched-count"] == "2"
    assert response.headers["x-unmatched-count"] == "0"
    assert response.headers["x-match-mode"] == "nombre"


def test_excel_municipality_names_are_georeferenced():
    content = _xlsx_bytes(
        [
            {"municipio": "Cobán", "valor": 10},
            {"municipio": "Ixcán", "valor": 20},
        ]
    )
    response = client.post(
        "/procesar_csv/",
        files={
            "file": (
                "municipios.xlsx",
                content,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
        data={
            "pais": "GTM",
            "nivel": "municipios",
            "columna_codigo": "municipio",
            "formatos": "geojson",
        },
    )
    assert response.status_code == 200, response.text
    assert response.headers["x-matched-count"] == "2"
    assert response.headers["x-unmatched-count"] == "0"
    assert response.headers["x-match-mode"] == "nombre"


def test_excel_department_ids_are_georeferenced():
    content = _xlsx_bytes(
        [
            {"id_departamento": "01", "valor": 10},
            {"id_departamento": "03", "valor": 20},
        ]
    )
    response = client.post(
        "/procesar_csv/",
        files={
            "file": (
                "departamentos_ids.xlsx",
                content,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
        data={
            "pais": "GTM",
            "nivel": "departamentos",
            "columna_codigo": "id_departamento",
            "formatos": "geojson",
        },
    )
    assert response.status_code == 200, response.text
    assert response.headers["x-matched-count"] == "2"
    assert response.headers["x-match-mode"] == "codigo"


def test_excel_municipality_ids_are_georeferenced():
    content = _xlsx_bytes(
        [
            {"id_municipio": "1601", "valor": 10},
            {"id_municipio": "1420", "valor": 20},
        ]
    )
    response = client.post(
        "/procesar_csv/",
        files={
            "file": (
                "municipios_ids.xlsx",
                content,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
        data={
            "pais": "GTM",
            "nivel": "municipios",
            "columna_codigo": "id_municipio",
            "formatos": "geojson",
        },
    )
    assert response.status_code == 200, response.text
    assert response.headers["x-matched-count"] == "2"
    assert response.headers["x-match-mode"] == "codigo"

