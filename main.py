from fastapi import FastAPI, File, UploadFile
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

import pandas as pd
import geopandas as gpd
import os
import zipfile
import uuid

from utils.normalizar_csv import normalizar_csv

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Departamentos-Encontrados", "X-Departamentos-No-Encontrados"]
)

@app.post("/procesar_csv/")
async def procesar_csv(file: UploadFile = File(...)):
    try:
        gdf_base = gpd.read_file("Departamentos/departamentos.shp")
        df_csv = pd.read_csv(file.file)

        df_csv, codigos_validos, codigos_encontrados, codigos_no_encontrados, col_codigo = normalizar_csv(
            df_csv, gdf_base
        )

        cod_a_nombre = dict(zip(gdf_base["cod_dep"].astype(int), gdf_base["departamen"]))
        nombres_encontrados = [cod_a_nombre.get(int(c)) for c in sorted(codigos_encontrados)]
        nombres_no_encontrados = [str(c) for c in sorted(codigos_no_encontrados)]

        if col_codigo == "cod_dep":
            df_csv = df_csv.rename(columns={"cod_dep": "cod_dep_csv"})
            merge_right_on = "cod_dep_csv"
        else:
            merge_right_on = col_codigo

        gdf_out = gdf_base.merge(
            df_csv,
            how="right",
            left_on="cod_dep",
            right_on=merge_right_on
        )

        gdf_out = gdf_out.loc[:, ~gdf_out.columns.duplicated()]
        gdf_out = gdf_out[gdf_out.geometry.notnull()]

        cols = [c for c in gdf_out.columns if c != 'geometry'] + ['geometry']
        gdf_out = gdf_out[cols]

        output_id = str(uuid.uuid4())
        output_dir = f"output/{output_id}"
        os.makedirs(output_dir, exist_ok=True)

        output_shp = f"{output_dir}/departamentos_result.shp"
        output_kml = f"{output_dir}/departamentos_result.kml"

        gdf_out.to_file(output_shp, encoding="utf-8")
        gdf_out.to_crs("EPSG:4326").to_file(output_kml, driver="KML")

        zip_path = f"{output_dir}.zip"
        with zipfile.ZipFile(zip_path, "w") as zipf:
            for fname in os.listdir(output_dir):
                zipf.write(os.path.join(output_dir, fname), arcname=fname)

        return FileResponse(
            zip_path,
            filename="departamentos_resultado.zip",
            media_type="application/zip",
            headers={
                "X-Departamentos-Encontrados": ",".join(nombres_encontrados),
                "X-Departamentos-No-Encontrados": ",".join(nombres_no_encontrados),
                "X-Codigos-Encontrados": ",".join(map(str, codigos_encontrados))
            }
        )

    except ValueError as e:
        return {"error": str(e)}

    except Exception as e:
        return {"error": f"Ocurrió un error inesperado: {str(e)}"}