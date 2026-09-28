import re
import unicodedata

import pandas as pd


COLUMN_CANDIDATES = {
    "departamentos": [
        "codigo_departamento",
        "codigo departamento",
        "id_departamento",
        "id departamento",
        "cod_departamento",
        "cod_dep",
        "departamento_codigo",
        "departamento",
        "depto",
        "nombre_departamento",
        "codigo",
    ],
    "municipios": [
        "codigo_municipio",
        "codigo municipio",
        "id_municipio",
        "id municipio",
        "cod_municipio",
        "cod_muni",
        "codigo_ine",
        "municipio_codigo",
        "municipio",
        "nombre_municipio",
        "codigo",
    ],
    "estados": [
        "codigo_estado",
        "codigo estado",
        "id_estado",
        "id estado",
        "cod_estado",
        "cve_ent",
        "clave_entidad",
        "estado_codigo",
        "estado",
        "nombre_estado",
        "codigo",
    ],
    "distritos": [
        "codigo_distrito",
        "codigo distrito",
        "id_distrito",
        "id distrito",
        "cod_distrito",
        "distrito_codigo",
        "distrito",
        "nombre_distrito",
        "codigo_territorial",
        "codigo",
    ],
    "departamentos_regiones": [
        "codigo_departamento",
        "codigo_region",
        "id_departamento",
        "id_region",
        "departamento",
        "region",
        "nombre_departamento",
        "nombre_region",
        "codigo_territorial",
        "admin_code",
        "codigo",
    ],
    "provincias": [
        "codigo_provincia",
        "codigo provincia",
        "id_provincia",
        "id provincia",
        "cod_provincia",
        "provincia_codigo",
        "provincia",
        "nombre_provincia",
        "codigo_territorial",
        "codigo",
    ],
    "provincias_comarcas": [
        "codigo_provincia",
        "codigo_comarca",
        "id_provincia",
        "id_comarca",
        "provincia",
        "comarca",
        "nombre_provincia",
        "nombre_comarca",
        "codigo_territorial",
        "admin_code",
        "codigo",
    ],
}

PARENT_COLUMN_CANDIDATES = [
    "departamento",
    "nombre_departamento",
    "depto",
    "departamento_nombre",
    "parent_name",
]


def normalizar_nombre_columna(value: str) -> str:
    """Produce a comparison-safe name without changing the original header."""
    text = unicodedata.normalize("NFKD", str(value))
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = re.sub(r"[^a-z0-9]+", "_", text.lower().strip())
    return text.strip("_")


def normalizar_nombre_territorio(value) -> str | None:
    if pd.isna(value):
        return None
    text = str(value).strip()
    if not text:
        return None
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = re.sub(r"[^a-z0-9]+", " ", text.lower())
    text = " ".join(text.split())
    return text or None


def detectar_columna_codigo(columns, nivel: str) -> str | None:
    """Backward-compatible name; now detects code or territorial-name columns."""
    normalized = {normalizar_nombre_columna(column): column for column in columns}
    for candidate in COLUMN_CANDIDATES[nivel]:
        match = normalized.get(normalizar_nombre_columna(candidate))
        if match is not None:
            return match
    return None


def detectar_columna_padre(columns, selected_column: str | None = None) -> str | None:
    normalized = {
        normalizar_nombre_columna(column): column
        for column in columns
        if column != selected_column
    }
    for candidate in PARENT_COLUMN_CANDIDATES:
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


def _build_reference_maps(
    reference,
    code_field: str,
    name_field: str,
    parent_name_field: str | None,
    code_width: int,
):
    valid_codes = set()
    names: dict[str, set[str]] = {}
    names_with_parent: dict[tuple[str, str], set[str]] = {}

    for _, row in reference.iterrows():
        code = normalizar_codigo(row.get(code_field), code_width)
        name = normalizar_nombre_territorio(row.get(name_field))
        if not code:
            continue
        valid_codes.add(code)
        if name:
            names.setdefault(name, set()).add(code)
            if parent_name_field and parent_name_field in reference.columns:
                parent = normalizar_nombre_territorio(row.get(parent_name_field))
                if parent:
                    names_with_parent.setdefault((name, parent), set()).add(code)

    return valid_codes, names, names_with_parent


def normalizar_csv(
    df_csv: pd.DataFrame,
    gdf_base,
    nivel: str,
    col_join_shape: str,
    code_width: int,
    col_join_csv: str | None = None,
    reference=None,
    reference_code_field: str | None = None,
    reference_name_field: str | None = None,
    reference_parent_name_field: str | None = None,
):
    """
    Validate a tabular territorial column and return rows with canonical codes.

    The selected column may contain either administrative IDs/codes or exact
    territorial names. Name matching is case/accent/punctuation insensitive.
    Ambiguous municipality names are only resolved when a parent-department
    column is present; otherwise they are reported rather than guessed.
    """
    if nivel not in COLUMN_CANDIDATES:
        raise ValueError("El nivel geográfico solicitado no es válido.")

    if col_join_csv:
        if col_join_csv not in df_csv.columns:
            raise ValueError(f"La columna '{col_join_csv}' no existe en el archivo.")
    else:
        col_join_csv = detectar_columna_codigo(df_csv.columns, nivel)

    if not col_join_csv:
        raise ValueError(
            "No se pudo identificar la columna territorial. "
            "Selecciona la columna con el nombre o ID correspondiente."
        )

    if reference is None:
        reference = gdf_base
        reference_code_field = reference_code_field or col_join_shape
        reference_name_field = reference_name_field or "name"

    reference_code_field = reference_code_field or col_join_shape
    reference_name_field = reference_name_field or "name"

    if reference_code_field not in reference.columns:
        raise ValueError("La capa de referencia no contiene el campo de código configurado.")
    if reference_name_field not in reference.columns:
        raise ValueError("La capa de referencia no contiene el campo de nombre configurado.")

    valid_codes, names, names_with_parent = _build_reference_maps(
        reference,
        reference_code_field,
        reference_name_field,
        reference_parent_name_field,
        code_width,
    )
    if not valid_codes:
        raise ValueError("La capa de referencia no contiene códigos territoriales válidos.")

    parent_column = None
    if reference_parent_name_field and reference_parent_name_field in reference.columns:
        parent_column = detectar_columna_padre(df_csv.columns, col_join_csv)

    clean_column = "__csv2map_code__"
    df_csv = df_csv.copy()

    matched_by_code = 0
    matched_by_name = 0
    unmatched_values: set[str] = set()
    ambiguous_values: set[str] = set()
    empty_count = 0

    resolved_codes = []
    for _, row in df_csv.iterrows():
        raw_value = row.get(col_join_csv)
        raw_text = "" if pd.isna(raw_value) else str(raw_value).strip()
        if not raw_text:
            resolved_codes.append(None)
            empty_count += 1
            continue

        code_candidate = normalizar_codigo(raw_value, code_width)
        if code_candidate in valid_codes:
            resolved_codes.append(code_candidate)
            matched_by_code += 1
            continue

        name_key = normalizar_nombre_territorio(raw_value)
        candidates = names.get(name_key or "", set())
        if len(candidates) == 1:
            resolved_codes.append(next(iter(candidates)))
            matched_by_name += 1
            continue

        if len(candidates) > 1 and parent_column:
            parent_key = normalizar_nombre_territorio(row.get(parent_column))
            parent_candidates = names_with_parent.get((name_key or "", parent_key or ""), set())
            if len(parent_candidates) == 1:
                resolved_codes.append(next(iter(parent_candidates)))
                matched_by_name += 1
                continue

        resolved_codes.append(None)
        if len(candidates) > 1:
            ambiguous_values.add(raw_text)
        else:
            unmatched_values.add(raw_text)

    df_csv[clean_column] = resolved_codes
    rows_received = int(len(df_csv))
    df_valid = df_csv.dropna(subset=[clean_column]).copy()

    matched_codes = sorted(set(df_valid[clean_column]))
    duplicates = int(df_valid.duplicated(subset=[clean_column]).sum())

    if matched_by_code and matched_by_name:
        match_mode = "mixto"
    elif matched_by_name:
        match_mode = "nombre"
    elif matched_by_code:
        match_mode = "codigo"
    else:
        match_mode = "sin_coincidencias"

    summary = {
        "column": col_join_csv,
        "rows_received": rows_received,
        "rows_valid": int(len(df_valid)),
        "matched_codes": matched_codes,
        "unmatched_codes": sorted(unmatched_values),
        "ambiguous_values": sorted(ambiguous_values),
        "empty_codes": empty_count,
        "duplicate_rows": duplicates,
        "join_column": clean_column,
        "match_mode": match_mode,
        "matched_by_code": matched_by_code,
        "matched_by_name": matched_by_name,
        "parent_column": parent_column,
    }
    return df_valid, summary
