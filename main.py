from __future__ import annotations

import io
import json
import os
import shutil
import tempfile
import zipfile
import unicodedata
import csv
from functools import lru_cache
from pathlib import Path

import geopandas as gpd
import pandas as pd
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from utils.normalizar_csv import normalizar_codigo, normalizar_csv


BASE_DIR = Path(__file__).resolve().parent
MAX_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_FORMATS = {"shp", "kml", "geojson", "gpkg"}
CATALOG_PATH = BASE_DIR / "geo_guate_frontend" / "public" / "countries" / "catalog.json"
ADMIN_CODES_PATH = BASE_DIR / "geo_guate_frontend" / "public" / "countries" / "admin1_codes.json"


def load_layer_catalog() -> dict[str, dict[str, dict[str, object]]]:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    layers: dict[str, dict[str, dict[str, object]]] = {}
    for country in catalog["countries"]:
        country_layers: dict[str, dict[str, object]] = {}
        for level in country["levels"]:
            api = level.get("api")
            if (
                not api
                or not (api.get("url") or api.get("path"))
                or not api.get("code_field")
                or level.get("code_width") is None
            ):
                # Static/reference layers can live in the frontend catalog without
                # participating in CSV georeferencing through the API.
                continue
            source_path = api.get("url") or str(BASE_DIR / api["path"])
            map_url = level.get("map_url")
            match_path = None
            if map_url and str(map_url).startswith("/"):
                match_path = str(BASE_DIR / "geo_guate_frontend" / "public" / str(map_url).lstrip("/"))
            country_layers[level["id"]] = {
                "path": source_path,
                "code_field": api["code_field"],
                "code_width": int(level["code_width"]),
                "basename": api["basename"],
                "country_name": country["name"],
                "source": level.get("source_label") or country["source_label"],
                "transform": api.get("transform"),
                "code_map": api.get("code_map"),
                "match_path": match_path,
                "match_code_field": level.get("code_property") or api["code_field"],
                "match_name_field": level.get("name_property") or "name",
                "match_parent_name_field": level.get("parent_name_property"),
            }
        layers[country["code"]] = country_layers
    return layers


LAYERS = load_layer_catalog()

ADMIN1_CODE_MAPS = json.loads(ADMIN_CODES_PATH.read_text(encoding="utf-8"))
def normalize_text_key(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    return " ".join(
        "".join(char for char in text if not unicodedata.combining(char))
        .lower()
        .replace("-", " ")
        .split()
    )


def transform_configured_layer(
    gdf: gpd.GeoDataFrame,
    transform: str | None,
    code_map: str | None = None,
) -> gpd.GeoDataFrame:
    if transform != "admin1_codes":
        return gdf

    mapping = ADMIN1_CODE_MAPS.get(code_map or "", {})
    if not mapping:
        raise ValueError(f"No hay mapa de códigos configurado para {code_map!r}.")
    normalized_mapping = {
        normalize_text_key(key): value
        for key, value in mapping.items()
    }

    name_field = "shapeName" if "shapeName" in gdf.columns else "name"
    transformed = gdf.copy()
    transformed["name"] = transformed[name_field].astype(str)
    transformed["admin_code"] = transformed["name"].map(
        lambda value: normalized_mapping.get(normalize_text_key(value), "")
    )
    missing = transformed.loc[transformed["admin_code"] == "", "name"].tolist()
    if missing:
        raise ValueError(
            "No se pudieron asignar códigos administrativos a: " + ", ".join(missing[:10])
        )
    return transformed



def configured_origins() -> list[str]:
    value = os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,https://converttomap.com,https://www.converttomap.com,https://csv2map.vercel.app",
    )
    return [origin.strip() for origin in value.split(",") if origin.strip()]


app = FastAPI(
    title="ConvertToMap API",
    version="2.1.0",
    description="Convierte tablas CSV y capas GeoJSON en formatos GIS.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    expose_headers=["X-Matched-Count", "X-Unmatched-Count"],
)


@lru_cache(maxsize=8)
def load_layer(pais: str, nivel: str | None = None) -> gpd.GeoDataFrame:
    # Compatibilidad temporal con llamadas anteriores: load_layer("departamentos").
    if nivel is None:
        pais, nivel = "GTM", pais
    if pais not in LAYERS or nivel not in LAYERS[pais]:
        raise ValueError("País o nivel geográfico no válido.")
    config = LAYERS[pais][nivel]
    frame = gpd.read_file(config["path"])
    return transform_configured_layer(frame, config.get("transform"), config.get("code_map"))


def parse_csv(content: bytes) -> tuple[pd.DataFrame, str]:
    last_error = None
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            text = content.decode(encoding)
            try:
                delimiter = csv.Sniffer().sniff(text[:8192], delimiters=",;\t|").delimiter
            except csv.Error:
                delimiter = ","
            frame = pd.read_csv(
                io.StringIO(text),
                sep=delimiter,
                dtype=str,
                keep_default_na=False,
            )
            if frame.empty:
                raise ValueError("El archivo no contiene filas de datos.")
            return frame, encoding
        except (UnicodeDecodeError, pd.errors.ParserError, ValueError) as exc:
            last_error = exc
    raise ValueError(f"No fue posible leer el CSV: {last_error}")


def parse_table(
    content: bytes,
    filename: str,
    sheet_name: str | None = None,
) -> tuple[pd.DataFrame, dict[str, object]]:
    lower_name = filename.lower()
    if lower_name.endswith(".csv"):
        frame, encoding = parse_csv(content)
        return frame, {
            "format": "csv",
            "encoding": encoding,
            "sheet_name": None,
            "sheet_names": [],
        }

    if lower_name.endswith(".xlsx"):
        try:
            excel = pd.ExcelFile(io.BytesIO(content), engine="openpyxl")
        except Exception as exc:
            raise ValueError("No fue posible abrir el archivo Excel.") from exc

        if not excel.sheet_names:
            raise ValueError("El archivo Excel no contiene hojas.")

        selected_sheet = sheet_name if sheet_name in excel.sheet_names else excel.sheet_names[0]
        try:
            frame = pd.read_excel(
                io.BytesIO(content),
                sheet_name=selected_sheet,
                dtype=str,
                keep_default_na=False,
                engine="openpyxl",
            )
        except Exception as exc:
            raise ValueError(f"No fue posible leer la hoja '{selected_sheet}'.") from exc

        frame.columns = [str(column).strip() for column in frame.columns]
        frame = frame.loc[
            ~frame.apply(lambda row: all(str(value).strip() == "" for value in row), axis=1)
        ].copy()
        if frame.empty or not len(frame.columns):
            raise ValueError(f"La hoja '{selected_sheet}' no contiene datos.")

        return frame, {
            "format": "xlsx",
            "encoding": None,
            "sheet_name": selected_sheet,
            "sheet_names": excel.sheet_names,
        }

    raise ValueError("Formato no compatible. Usa CSV o Excel .xlsx.")


@lru_cache(maxsize=16)
def load_match_reference(pais: str, nivel: str) -> gpd.GeoDataFrame:
    config = LAYERS[pais][nivel]
    match_path = config.get("match_path")
    if match_path and Path(str(match_path)).exists():
        return gpd.read_file(match_path)

    # Some countries use a remote source and normalize name/admin_code at load time.
    # Reuse that already-normalized base instead of requiring a duplicated local file.
    reference = load_layer(pais, nivel).copy()
    required = {config["match_code_field"], config["match_name_field"]}
    if not required.issubset(reference.columns):
        raise ValueError("No hay una capa de referencia compatible para validar nombres.")
    return reference


def clean_properties_for_kml(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    cleaned = gdf.copy()
    for column in cleaned.columns:
        if column != cleaned.geometry.name:
            cleaned[column] = cleaned[column].fillna("").astype(str)
    return cleaned


def export_formats(
    gdf: gpd.GeoDataFrame,
    output_dir: Path,
    basename: str,
    formats: set[str],
) -> None:
    if "shp" in formats:
        gdf.to_file(output_dir / f"{basename}.shp", encoding="utf-8")
    if "geojson" in formats:
        gdf.to_crs("EPSG:4326").to_file(
            output_dir / f"{basename}.geojson", driver="GeoJSON"
        )
    if "gpkg" in formats:
        gdf.to_file(
            output_dir / f"{basename}.gpkg",
            driver="GPKG",
            layer=basename,
        )
    if "kml" in formats:
        clean_properties_for_kml(gdf).to_crs("EPSG:4326").to_file(
            output_dir / f"{basename}.kml", driver="KML"
        )


def remove_workspace(path: str) -> None:
    shutil.rmtree(path, ignore_errors=True)


def build_zip_response(
    background_tasks: BackgroundTasks,
    workspace: Path,
    output_dir: Path,
    basename: str,
    headers: dict[str, str] | None = None,
) -> FileResponse:
    zip_path = workspace / f"{basename}.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for output_file in output_dir.iterdir():
            archive.write(output_file, arcname=output_file.name)

    background_tasks.add_task(remove_workspace, str(workspace))
    return FileResponse(
        zip_path,
        filename=zip_path.name,
        media_type="application/zip",
        headers=headers or {},
    )


@app.get("/")
def root():
    return {"name": "ConvertToMap API", "version": "2.1.0", "status": "ok"}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.post("/exportar_geojson/")
async def exportar_geojson(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    formatos: str = Form("shp"),
    pais: str = Form(""),
    nivel: str = Form(""),
):
    if not file.filename or not file.filename.lower().endswith((".geojson", ".json")):
        raise HTTPException(status_code=400, detail="Debes cargar una capa GeoJSON.")

    content = await file.read(MAX_FILE_SIZE + 1)
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="La capa supera el límite de 10 MB.")
    if not content:
        raise HTTPException(status_code=400, detail="La capa está vacía.")

    selected_formats = {
        value.strip().lower() for value in formatos.split(",") if value.strip()
    }
    if not selected_formats or not selected_formats.issubset(ALLOWED_FORMATS):
        raise HTTPException(status_code=400, detail="Selecciona al menos un formato válido.")

    workspace = Path(tempfile.mkdtemp(prefix="converttomap_geojson_"))
    try:
        input_path = workspace / "entrada.geojson"
        input_path.write_bytes(content)
        gdf = gpd.read_file(input_path)
        if gdf.empty:
            raise ValueError("La capa no contiene entidades geográficas.")
        if gdf.crs is None:
            gdf = gdf.set_crs("EPSG:4326")
        if not set(gdf.geometry.geom_type).issubset({"Point", "MultiPoint"}):
            raise ValueError("Por ahora Crear capa admite únicamente geometrías de puntos.")

        output_dir = workspace / "archivos"
        output_dir.mkdir()
        basename = "converttomap_puntos"
        export_formats(gdf, output_dir, basename, selected_formats)

        pais_norm = pais.upper().strip()
        nivel_norm = nivel.strip()
        territorial_source = "ConvertToMap"
        territorial_country = pais_norm or None
        territorial_level = nivel_norm or None
        if pais_norm in LAYERS and nivel_norm in LAYERS[pais_norm]:
            layer_config = LAYERS[pais_norm][nivel_norm]
            territorial_source = str(layer_config.get("source") or territorial_source)

        metadata = {
            "converttomap_version": "2.1.0",
            "geometry": "Point",
            "features": int(len(gdf)),
            "formats": sorted(selected_formats),
            "territorial_source": territorial_source,
            "pais_codigo": territorial_country,
            "nivel": territorial_level,
        }
        (output_dir / "metadata.json").write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return build_zip_response(background_tasks, workspace, output_dir, basename)
    except ValueError as exc:
        remove_workspace(str(workspace))
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except HTTPException:
        remove_workspace(str(workspace))
        raise
    except Exception as exc:
        remove_workspace(str(workspace))
        raise HTTPException(
            status_code=500,
            detail="No se pudo exportar la capa. Revisa sus atributos e inténtalo nuevamente.",
        ) from exc


def resolve_csv_coordinate_column(frame: pd.DataFrame, requested: str, candidates: tuple[str, ...]) -> str:
    def key(value: str) -> str:
        return ''.join(char for char in normalize_text_key(value) if char.isalnum())
    by_lower = {key(str(column)): str(column) for column in frame.columns}
    requested_key = key(requested)
    if requested_key:
        if requested_key not in by_lower:
            raise ValueError(f"No se encontró la columna '{requested}'.")
        return by_lower[requested_key]
    for candidate in candidates:
        if key(candidate) in by_lower:
            return by_lower[key(candidate)]
    raise ValueError(
        "No se encontró una columna de coordenadas válida. "
        "Indica los nombres de las columnas de latitud y longitud."
    )


def enrich_municipal_points(points: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    municipalities = load_layer("GTM", "municipios").to_crs("EPSG:4326")
    reference = gpd.GeoDataFrame({
        "codigo_municipio": municipalities["cod_muni_1"].map(lambda v: normalizar_codigo(v, 4)),
        "municipio": municipalities["nombre_1"],
        "codigo_departamento": municipalities["cod_dept_1"].map(lambda v: normalizar_codigo(v, 2)),
        "departamento": municipalities["depto_1"],
    }, geometry=municipalities.geometry, crs=municipalities.crs)
    # Boundaries can intersect more than one municipality: keep one row per point
    # and report ambiguity instead of assigning an arbitrary municipality.
    matches = gpd.sjoin(points[[points.geometry.name]], reference, how="left", predicate="intersects")
    counts = matches.groupby(level=0)["index_right"].count()
    unique = matches[~matches.index.duplicated(keep="first")]
    result = points.copy()
    for column in ("codigo_municipio", "municipio", "codigo_departamento", "departamento"):
        target = column
        if target in result.columns:
            target = f"ctm_{column}"
            while target in result.columns:
                target = f"ctm_{target}"
        result[target] = unique[column].where(counts.eq(1), "").fillna("").reindex(result.index)
    status_column = "estado_territorial"
    while status_column in result.columns:
        status_column = f"ctm_{status_column}"
    result[status_column] = counts.map(lambda n: "asignado" if n == 1 else "limite_ambiguo" if n > 1 else "fuera_de_capa")
    return result


def read_convertible_layer(
    workspace: Path,
    filename: str,
    content: bytes,
    columna_latitud: str,
    columna_longitud: str,
    hoja: str | None = None,
) -> tuple[gpd.GeoDataFrame, str]:
    lower_name = filename.lower()

    if lower_name.endswith((".csv", ".xlsx")):
        frame, _ = parse_table(content, filename, hoja)
        frame = frame.reset_index(drop=True)
        lat_col = resolve_csv_coordinate_column(
            frame,
            columna_latitud,
            ("latitud", "latitude", "lat", "y", "coord_lat", "coordenada_latitud", "lat_dd", "decimal_latitude"),
        )
        lon_col = resolve_csv_coordinate_column(
            frame,
            columna_longitud,
            ("longitud", "longitude", "lon", "lng", "long", "x", "coord_lon", "coordenada_longitud", "lon_dd", "decimal_longitude"),
        )
        if lat_col == lon_col:
            raise ValueError("La latitud y la longitud deben usar columnas distintas.")
        lat = pd.to_numeric(frame[lat_col].astype(str).str.strip().str.replace(",", ".", regex=False), errors="coerce")
        lon = pd.to_numeric(frame[lon_col].astype(str).str.strip().str.replace(",", ".", regex=False), errors="coerce")
        invalid = int((~lat.between(-90, 90) | ~lon.between(-180, 180)).sum())
        if invalid:
            raise ValueError(
                f"El archivo contiene {invalid} fila(s) con coordenadas vacías, no numéricas o fuera del rango WGS84."
            )
        gdf = gpd.GeoDataFrame(
            frame.copy(),
            geometry=gpd.points_from_xy(lon, lat),
            crs="EPSG:4326",
        )
        return enrich_municipal_points(gdf), "xlsx" if lower_name.endswith(".xlsx") else "csv"

    if lower_name.endswith(".zip"):
        zip_path = workspace / "entrada.zip"
        zip_path.write_bytes(content)
        extract_dir = workspace / "shapefile"
        extract_dir.mkdir()
        with zipfile.ZipFile(zip_path) as archive:
            for member in archive.infolist():
                member_path = (extract_dir / member.filename).resolve()
                if extract_dir.resolve() not in member_path.parents and member_path != extract_dir.resolve():
                    raise ValueError("El ZIP contiene rutas no válidas.")
                archive.extract(member, extract_dir)
        shapefiles = list(extract_dir.rglob("*.shp"))
        if not shapefiles:
            raise ValueError("El ZIP no contiene un archivo .shp.")
        return gpd.read_file(shapefiles[0]), "shp"

    suffix_map = {
        ".geojson": "geojson",
        ".json": "geojson",
        ".kml": "kml",
        ".gpkg": "gpkg",
    }
    source_format = next(
        (value for suffix, value in suffix_map.items() if lower_name.endswith(suffix)),
        None,
    )
    if not source_format:
        raise ValueError("Formato de entrada no compatible.")

    suffix = Path(filename).suffix.lower()
    input_path = workspace / f"entrada{suffix}"
    input_path.write_bytes(content)
    return gpd.read_file(input_path), source_format


def export_single_format(
    gdf: gpd.GeoDataFrame,
    workspace: Path,
    formato: str,
) -> tuple[Path, str]:
    basename = "converttomap_conversion"

    if formato == "geojson":
        output = workspace / f"{basename}.geojson"
        gdf.to_crs("EPSG:4326").to_file(output, driver="GeoJSON")
        return output, "application/geo+json"

    if formato == "gpkg":
        output = workspace / f"{basename}.gpkg"
        gdf.to_file(output, driver="GPKG", layer=basename)
        return output, "application/geopackage+sqlite3"

    if formato == "kml":
        output = workspace / f"{basename}.kml"
        clean_properties_for_kml(gdf).to_crs("EPSG:4326").to_file(output, driver="KML")
        return output, "application/vnd.google-earth.kml+xml"

    if formato == "csv":
        output = workspace / f"{basename}.csv"
        tabular = gdf.copy()
        geometry_4326 = tabular.to_crs("EPSG:4326").geometry
        if set(geometry_4326.geom_type).issubset({"Point"}):
            if "latitud" not in tabular.columns:
                tabular["latitud"] = geometry_4326.y
            if "longitud" not in tabular.columns:
                tabular["longitud"] = geometry_4326.x
        tabular["geometry_wkt"] = geometry_4326.to_wkt()
        pd.DataFrame(tabular.drop(columns=[tabular.geometry.name])).to_csv(
            output, index=False, encoding="utf-8-sig"
        )
        return output, "text/csv"

    if formato == "shp":
        shp_dir = workspace / "shapefile_salida"
        shp_dir.mkdir()
        shp_path = shp_dir / f"{basename}.shp"
        gdf.to_file(shp_path, driver="ESRI Shapefile", encoding="utf-8")
        output = workspace / f"{basename}_shapefile.zip"
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for part in shp_dir.iterdir():
                archive.write(part, arcname=part.name)
        return output, "application/zip"

    raise ValueError("Formato de salida no válido.")


@app.post("/convertir_formato/")
async def convertir_formato(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    formato_salida: str = Form(...),
    columna_latitud: str = Form(""),
    columna_longitud: str = Form(""),
    hoja: str | None = Form(None),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Debes cargar un archivo.")

    formato_salida = formato_salida.strip().lower()
    allowed_outputs = {"geojson", "shp", "kml", "gpkg", "csv"}
    if formato_salida not in allowed_outputs:
        raise HTTPException(status_code=400, detail="Formato de salida no válido.")

    content = await file.read(MAX_FILE_SIZE + 1)
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="El archivo supera el límite de 10 MB.")
    if not content:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    workspace = Path(tempfile.mkdtemp(prefix="converttomap_convert_"))
    try:
        gdf, source_format = read_convertible_layer(
            workspace,
            file.filename,
            content,
            columna_latitud,
            columna_longitud,
            hoja,
        )
        if gdf.empty:
            raise ValueError("La capa no contiene entidades geográficas.")
        if gdf.geometry.isna().all():
            raise ValueError("La capa no contiene geometrías válidas.")
        gdf = gdf[gdf.geometry.notnull()].copy()
        if gdf.crs is None:
            gdf = gdf.set_crs("EPSG:4326")

        if source_format == formato_salida:
            raise ValueError("El formato de salida es igual al formato de entrada.")

        output_path, media_type = export_single_format(gdf, workspace, formato_salida)
        background_tasks.add_task(remove_workspace, str(workspace))
        return FileResponse(
            output_path,
            filename=output_path.name,
            media_type=media_type,
            headers={
                "X-Source-Format": source_format,
                "X-Feature-Count": str(len(gdf)),
            },
        )
    except ValueError as exc:
        remove_workspace(str(workspace))
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except HTTPException:
        remove_workspace(str(workspace))
        raise
    except Exception as exc:
        remove_workspace(str(workspace))
        raise HTTPException(
            status_code=500,
            detail="No se pudo convertir la capa. Verifica que el archivo sea válido y vuelve a intentarlo.",
        ) from exc


@app.post("/inspeccionar_tabla/")
async def inspeccionar_tabla(
    file: UploadFile = File(...),
    hoja: str | None = Form(None),
):
    if not file.filename or not file.filename.lower().endswith((".csv", ".xlsx")):
        raise HTTPException(status_code=400, detail="Debes cargar un archivo CSV o Excel .xlsx.")

    content = await file.read(MAX_FILE_SIZE + 1)
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="El archivo supera el límite de 10 MB.")
    if not content:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    try:
        frame, info = parse_table(content, file.filename, hoja)
        preview = frame.head(10).fillna("").astype(str).to_dict(orient="records")
        return {
            "headers": [str(column) for column in frame.columns],
            "rows": preview,
            **info,
        }
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/procesar_csv/")
async def procesar_csv(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    pais: str = Form("GTM"),
    nivel: str = Form("departamentos"),
    columna_codigo: str | None = Form(None),
    formatos: str = Form("shp,kml"),
    hoja: str | None = Form(None),
):
    pais = pais.upper().strip()
    if pais not in LAYERS or nivel not in LAYERS[pais]:
        raise HTTPException(status_code=400, detail="País o nivel geográfico no válido.")
    if not file.filename or not file.filename.lower().endswith((".csv", ".xlsx")):
        raise HTTPException(status_code=400, detail="Debes cargar un archivo CSV o Excel .xlsx.")

    content = await file.read(MAX_FILE_SIZE + 1)
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="El archivo supera el límite de 10 MB.")
    if not content:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    selected_formats = {
        value.strip().lower() for value in formatos.split(",") if value.strip()
    }
    if not selected_formats or not selected_formats.issubset(ALLOWED_FORMATS):
        raise HTTPException(status_code=400, detail="Selecciona al menos un formato válido.")

    config = LAYERS[pais][nivel]
    try:
        df_csv, table_info = parse_table(content, file.filename, hoja)
        base = load_layer(pais, nivel).copy()
        reference = load_match_reference(pais, nivel)
        df_csv, summary = normalizar_csv(
            df_csv,
            base,
            nivel=nivel,
            col_join_shape=config["code_field"],
            code_width=config["code_width"],
            col_join_csv=columna_codigo or None,
            reference=reference,
            reference_code_field=config["match_code_field"],
            reference_name_field=config["match_name_field"],
            reference_parent_name_field=config.get("match_parent_name_field"),
        )
        if df_csv.empty:
            extra = ""
            if summary.get("ambiguous_values"):
                extra = " Hay nombres ambiguos que requieren identificar también el departamento."
            raise ValueError(
                "Ningún nombre o ID del archivo coincide con la capa seleccionada." + extra
            )

        join_column = summary["join_column"]
        base[join_column] = base[config["code_field"]].map(
            lambda value: normalizar_codigo(value, config["code_width"])
        )
        gdf_out = base.merge(df_csv, how="inner", on=join_column)
        gdf_out = gdf_out.loc[:, ~gdf_out.columns.duplicated()]
        gdf_out = gdf_out[gdf_out.geometry.notnull()].drop(columns=[join_column])
        geometry_column = gdf_out.geometry.name
        gdf_out = gdf_out[
            [column for column in gdf_out.columns if column != geometry_column]
            + [geometry_column]
        ]

        workspace = Path(tempfile.mkdtemp(prefix="csv2map_"))
        output_dir = workspace / "archivos"
        output_dir.mkdir()
        export_formats(gdf_out, output_dir, config["basename"], selected_formats)

        metadata = {
            "csv2map_version": "2.1.0",
            "pais_codigo": pais,
            "pais": config["country_name"],
            "nivel": nivel,
            "source": config["source"],
            "file_format": table_info["format"],
            "encoding": table_info["encoding"],
            "sheet_name": table_info["sheet_name"],
            "formats": sorted(selected_formats),
            **{key: value for key, value in summary.items() if key != "join_column"},
        }
        (output_dir / "reporte_procesamiento.json").write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        return build_zip_response(
            background_tasks,
            workspace,
            output_dir,
            config["basename"],
            headers={
                "X-Matched-Count": str(len(summary["matched_codes"])),
                "X-Unmatched-Count": str(
                    len(summary["unmatched_codes"]) + len(summary.get("ambiguous_values", []))
                ),
                "X-Match-Mode": str(summary.get("match_mode") or ""),
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="No se pudo generar la capa geográfica. Revisa el archivo e inténtalo nuevamente.",
        ) from exc
