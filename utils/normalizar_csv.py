import re
import unicodedata

import pandas as pd


COLUMN_CANDIDATES = {
    "departamentos": [
        "codigo_departamento",
        "codigo departamento",
        "cod_departamento",
        "cod_dep",
        "departamento_codigo",
        "codigo",
    ],
    "municipios": [
        "codigo_municipio",
        "codigo municipio",
        "cod_municipio",
        "cod_muni",
        "codigo_ine",
        "municipio_codigo",
        "codigo",
    ],
}


def normalizar_nombre_columna(value: str) -> str:
    """Produce a comparison-safe name without changing the original header."""
    text = unicodedata.normalize("NFKD", str(value))
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = re.sub(r"[^a-z0-9]+", "_", text.lower().strip())
    return text.strip("_")


def detectar_columna_codigo(columns, nivel: str) -> str | None:
    normalized = {normalizar_nombre_columna(column): column for column in columns}
    for candidate in COLUMN_CANDIDATES[nivel]:
        match = normalized.get(normalizar_nombre_columna(candidate))
        if match is not None:
            return match
    return None


def normalizar_codigo(value, width: int) -> str | None:
    if pd.isna(value):
        return None

    text = str(value).strip()
    if not text:
        return None

    # Spreadsheet programs often turn administrative codes into 1.0 or 301.0.
    text = re.sub(r"\.0+$", "", text)
    digits = re.sub(r"\D", "", text)
    if not digits:
        return None
    return digits.zfill(width)


def normalizar_csv(
    df_csv: pd.DataFrame,
    gdf_base,
    nivel: str,
    col_join_shape: str,
    code_width: int,
    col_join_csv: str | None = None,
):
    """Validate codes and return a clean CSV plus a processing summary."""
    if nivel not in COLUMN_CANDIDATES:
        raise ValueError("El nivel geográfico solicitado no es válido.")

    if col_join_csv:
        if col_join_csv not in df_csv.columns:
            raise ValueError(f"La columna '{col_join_csv}' no existe en el archivo.")
    else:
        col_join_csv = detectar_columna_codigo(df_csv.columns, nivel)

    if not col_join_csv:
        raise ValueError(
            "No se pudo identificar la columna de códigos. "
            "Selecciona manualmente la columna correspondiente."
        )

    clean_column = "__csv2map_code__"
    df_csv = df_csv.copy()
    df_csv[clean_column] = df_csv[col_join_csv].map(
        lambda value: normalizar_codigo(value, code_width)
    )

    rows_received = int(len(df_csv))
    empty_count = int(df_csv[clean_column].isna().sum())
    df_csv = df_csv.dropna(subset=[clean_column])

    base_codes = gdf_base[col_join_shape].map(
        lambda value: normalizar_codigo(value, code_width)
    )
    codigos_validos = set(base_codes.dropna())
    codigos_en_csv = set(df_csv[clean_column])
    codigos_encontrados = codigos_en_csv.intersection(codigos_validos)
    codigos_no_encontrados = codigos_en_csv - codigos_validos
    duplicates = int(df_csv.duplicated(subset=[clean_column]).sum())

    df_csv = df_csv[df_csv[clean_column].isin(codigos_validos)]

    summary = {
        "column": col_join_csv,
        "rows_received": rows_received,
        "rows_valid": int(len(df_csv)),
        "matched_codes": sorted(codigos_encontrados),
        "unmatched_codes": sorted(codigos_no_encontrados),
        "empty_codes": empty_count,
        "duplicate_rows": duplicates,
        "join_column": clean_column,
    }
    return df_csv, summary
