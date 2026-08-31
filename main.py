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

LAYERS = {
    "departamentos": {
        "path": BASE_DIR / "Departamentos" / "departamentos.shp",
        "code_field": "cod_dep",
        "code_width": 2,
        "basename": "departamentos_resultado",
        "source": "Límites departamentales incluidos en CSV2MAP GT",
    },
    "municipios": {
        "path": BASE_DIR
        / "geo_guate_frontend"
        / "public"
        / "Municipios"
        / "municipios.geojson",
        "code_field": "cod_muni_1",
        "code_width": 4,
        "basename": "municipios_resultado",
        "source": "CONRED Guatemala - Límites municipales (FeatureServer)",
    },
}


def configured_origins() -> list[str]:
    value = os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,https://converttomap.com,https://www.converttomap.com,https://csv2map.vercel.app",
    )
    return [origin.strip() for origin in value.split(",") if origin.strip()]


app = FastAPI(
    title="ConvertToMap API",
    version="2.0.0",
    description="Convierte tablas CSV en capas GIS de Guatemala.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    expose_headers=["X-Matched-Count", "X-Unmatched-Count"],
)


@lru_cache(maxsize=2)
def load_layer(nivel: str) -> gpd.GeoDataFrame:
    if nivel not in LAYERS:
        raise ValueError("Nivel geográfico no válido.")
    return gpd.read_file(LAYERS[nivel]["path"])


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


@app.get("/")
def root():
    return {"name": "ConvertToMap API", "version": "2.0.0", "status": "ok"}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.post("/procesar_csv/")
async def procesar_csv(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    nivel: str = Form("departamentos"),
    columna_codigo: str | None = Form(None),
    formatos: str = Form("shp,kml"),
):
    if nivel not in LAYERS:
        raise HTTPException(status_code=400, detail="Nivel geográfico no válido.")
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

    config = LAYERS[nivel]
    try:
        df_csv, encoding = parse_csv(content)
        base = load_layer(nivel).copy()
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
            "csv2map_version": "2.0.0",
            "nivel": nivel,
            "source": config["source"],
            "encoding": encoding,
            "formats": sorted(selected_formats),
            **{key: value for key, value in summary.items() if key != "join_column"},
        }
        (output_dir / "reporte_procesamiento.json").write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        zip_path = workspace / f"{config['basename']}.zip"
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for output_file in output_dir.iterdir():
                archive.write(output_file, arcname=output_file.name)

        background_tasks.add_task(remove_workspace, str(workspace))
        return FileResponse(
            zip_path,
            filename=zip_path.name,
            media_type="application/zip",
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
