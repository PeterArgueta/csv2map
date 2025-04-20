import pandas as pd

def normalizar_csv(df_csv: pd.DataFrame, gdf_base, col_join_csv_default="codigo_departamento", col_join_shape="cod_dep"):
    # Buscar nombre de columna que contenga el código de departamento
    posibles_columnas = ["codigo_departamento", "codigo", "cod_dep"]
    col_join_csv = None

    for posible in posibles_columnas:
        if posible in df_csv.columns:
            col_join_csv = posible
            break

    if not col_join_csv:
        raise ValueError("No se encontró una columna de códigos en el CSV. Asegúrate de que exista una columna 'codigo_departamento', 'codigo' o 'cod_dep'.")

    # Asegurar tipo entero
    gdf_base[col_join_shape] = gdf_base[col_join_shape].astype(int)
    codigos_validos = set(gdf_base[col_join_shape])

    # Limpiar y convertir los códigos del CSV
    df_csv[col_join_csv] = pd.to_numeric(df_csv[col_join_csv], errors="coerce")
    df_csv = df_csv.dropna(subset=[col_join_csv])
    df_csv[col_join_csv] = df_csv[col_join_csv].astype(int)

    codigos_en_csv = set(df_csv[col_join_csv])
    codigos_encontrados = codigos_en_csv.intersection(codigos_validos)
    codigos_no_encontrados = codigos_en_csv - codigos_validos

    df_csv = df_csv[df_csv[col_join_csv].isin(codigos_validos)]

    return df_csv, codigos_validos, codigos_encontrados, codigos_no_encontrados, col_join_csv
