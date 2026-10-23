#!/usr/bin/env python3
"""Import the pinned JSON transcription of INE's Censo 2018 centroids.

Usage: python scripts/import_gtm_places.py /path/to/centroides.json
Source revision and attribution are recorded in the public metadata.
No missing coordinates are inferred or replaced.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import math
import sys
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1]


def main() -> None:
    source = Path(sys.argv[1])
    departments = json.loads(source.read_text(encoding="utf-8"))
    features, excluded, seen = [], [], set()
    for department in departments:
        for municipality in department["municipios"]:
            for place in municipality["poblados"]:
                code = str(place["codigo"]).zfill(7)
                if code in seen:
                    raise ValueError(f"Duplicate place code: {code}")
                seen.add(code)
                point = place.get("centroide") or {}
                lon, lat = point.get("longitud"), point.get("latitud")
                if lon is None or lat is None:
                    excluded.append(code)
                    continue
                if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (lon, lat)):
                    raise ValueError(f"Invalid coordinates: {code}")
                if not (-93 < lon < -88 and 13 < lat < 19):
                    raise ValueError(f"Coordinates outside Guatemala's bounding box: {code}")
                features.append({
                    "type": "Feature",
                    "properties": {
                        "codigo": code,
                        "nombre": place["nombre"],
                        "cod_dep": str(department["codigo"]).zfill(2),
                        "depto": department["nombre"],
                        "cod_muni": str(municipality["codigo"]).zfill(4),
                        "municipio": municipality["nombre"],
                        "longitud": lon,
                        "latitud": lat,
                        "censo": 2018,
                    },
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                })
    payload = json.dumps({"type": "FeatureCollection", "features": features},
                         ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    target = FRONTEND / "data/GTM/lugares_poblados_ine_2018.geojson.gz"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(gzip.compress(payload, mtime=0))
    metadata_path = FRONTEND / "public/countries/GTM/lugares_poblados_ine_2018.metadata.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata.update({
        "source_json_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "geojson_sha256": hashlib.sha256(payload).hexdigest(),
        "source_records": len(seen), "feature_count": len(features),
        "excluded_without_coordinates": len(excluded),
        "excluded_codes": excluded,
    })
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(features)} centroids; excluded {len(excluded)} records without coordinates.")


if __name__ == "__main__":
    main()
