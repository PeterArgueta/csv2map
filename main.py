from __future__ import annotations

import io
import json
import os
import shutil
import tempfile
import zipfile
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


def load_layer_catalog() -> dict[str, dict[str, dict[str, object]]]:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    layers: dict[str, dict[str, dict[str, object]]] = {}
    for country in catalog["countries"]:
        country_layers: dict[str, dict[str, object]] = {}
        for level in country["levels"]:
            api = level.get("api")
            if not api:
                continue
            country_layers[level["id"]] = {
                "path": BASE_DIR / api["path"],
                "code_field": api["code_field"],
                "code_width": int(level["code_width"]),
                "basename": api["basename"],
                "country_name": country["name"],
                "source": country["source_label"],
            }
        layers[country["code"]] = country_layers
    return layers


LAYERS = load_layer_catalog()


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
    return gpd.read_file(LAYERS[pais][nivel]["path"])


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

        metadata = {
            "converttomap_version": "2.1.0",
            "geometry": "Point",
            "features": int(len(gdf)),
            "formats": sorted(selected_formats),
            "territorial_source": "IDEG - SEGEPLAN",
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
    by_lower = {str(column).strip().lower(): str(column) for column in frame.columns}
    requested_key = requested.strip().lower()
    if requested_key and requested_key in by_lower:
        return by_lower[requested_key]
    for candidate in candidates:
        if candidate in by_lower:
            return by_lower[candidate]
    raise ValueError(
        "No se encontró una columna de coordenadas válida. "
        "Indica los nombres de las columnas de latitud y longitud."
    )


def read_convertible_layer(
    workspace: Path,
    filename: str,
    content: bytes,
    columna_latitud: str,
    columna_longitud: str,
) -> tuple[gpd.GeoDataFrame, str]:
    lower_name = filename.lower()

    if lower_name.endswith(".csv"):
        frame, _ = parse_csv(content)
        lat_col = resolve_csv_coordinate_column(
            frame,
            columna_latitud,
            ("latitud", "latitude", "lat", "y"),
        )
        lon_col = resolve_csv_coordinate_column(
            frame,
            columna_longitud,
            ("longitud", "longitude", "lon", "lng", "long", "x"),
        )
        lat = pd.to_numeric(frame[lat_col], errors="coerce")
        lon = pd.to_numeric(frame[lon_col], errors="coerce")
        invalid = int((lat.isna() | lon.isna()).sum())
        if invalid:
            raise ValueError(
                f"El CSV contiene {invalid} fila(s) con coordenadas vacías o no numéricas."
            )
        gdf = gpd.GeoDataFrame(
            frame.copy(),
            geometry=gpd.points_from_xy(lon, lat),
            crs="EPSG:4326",
        )
        return gdf, "csv"

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


@app.post("/procesar_csv/")
async def procesar_csv(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    pais: str = Form("GTM"),
    nivel: str = Form("departamentos"),
    columna_codigo: str | None = Form(None),
    formatos: str = Form("shp,kml"),
):
    pais = pais.upper().strip()
    if pais not in LAYERS or nivel not in LAYERS[pais]:
        raise HTTPException(status_code=400, detail="País o nivel geográfico no válido.")
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Debes cargar un archivo CSV.")

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
        df_csv, encoding = parse_csv(content)
        base = load_layer(pais, nivel).copy()
        df_csv, summary = normalizar_csv(
            df_csv,
            base,
            nivel=nivel,
            col_join_shape=config["code_field"],
            code_width=config["code_width"],
            col_join_csv=columna_codigo or None,
        )
        if df_csv.empty:
            raise ValueError("Ningún código del archivo coincide con la capa seleccionada.")

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
            "encoding": encoding,
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
                "X-Unmatched-Count": str(len(summary["unmatched_codes"])),
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
