#!/usr/bin/env python3
from __future__ import annotations

import gzip
import json
import shutil
import subprocess
import unicodedata
import urllib.request
import urllib.parse
import zipfile
from pathlib import Path

FRONTEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = FRONTEND_DIR.parent
PUBLIC_DIR = FRONTEND_DIR / "public"
CATALOG_PATH = PUBLIC_DIR / "countries" / "catalog.json"
CODE_MAPS_PATH = PUBLIC_DIR / "countries" / "admin1_codes.json"
DOWNLOAD_DIR = PUBLIC_DIR / "downloads"
TMP_DIR = Path("/tmp/converttomap-build")


def run(*args: str) -> None:
    print("+", " ".join(args))
    subprocess.run(args, check=True)


def normalize_key(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    return " ".join(text.lower().replace("-", " ").split())


def download(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {url}")
    request = urllib.request.Request(url, headers={"User-Agent": "ConvertToMap-build/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response:
        destination.write_bytes(response.read())


def resolve_local_path(raw_path: str) -> Path:
    candidate = REPO_DIR / raw_path
    if candidate.exists():
        return candidate
    candidate = FRONTEND_DIR / raw_path
    if candidate.exists():
        return candidate
    raise FileNotFoundError(raw_path)


def fetch_json(url: str, params: dict[str, object]) -> dict:
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(
        f"{url}?{query}",
        headers={"User-Agent": "ConvertToMap-build/1.0"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def download_arcgis_layer(layer_url: str, destination: Path) -> Path:
    """Download every feature from a public ArcGIS REST layer as WGS84 GeoJSON."""
    query_url = layer_url.rstrip("/") + "/query"
    ids = fetch_json(query_url, {
        "where": "1=1",
        "returnIdsOnly": "true",
        "f": "json",
    }).get("objectIds") or []

    features = []
    if ids:
        batch_size = 200
        for offset in range(0, len(ids), batch_size):
            batch = ids[offset:offset + batch_size]
            payload = fetch_json(query_url, {
                "objectIds": ",".join(str(value) for value in batch),
                "outFields": "*",
                "returnGeometry": "true",
                "outSR": "4326",
                "f": "geojson",
            })
            features.extend(payload.get("features") or [])
    else:
        payload = fetch_json(query_url, {
            "where": "1=1",
            "outFields": "*",
            "returnGeometry": "true",
            "outSR": "4326",
            "f": "geojson",
        })
        features.extend(payload.get("features") or [])

    if not features:
        raise RuntimeError(f"No features returned by ArcGIS layer: {layer_url}")

    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Downloaded {len(features)} features from {layer_url}")
    return destination


def build_guatemala_zones() -> Path:
    parts_dir = PUBLIC_DIR / "ZonasGuatemala" / "parts"
    target = PUBLIC_DIR / "ZonasGuatemala" / "zonas_ciudad_guatemala.geojson"
    features = []
    for path in sorted(parts_dir.glob("*.geojson")):
        with path.open(encoding="utf-8") as source:
            features.extend(json.load(source)["features"])
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return target


def transform_remote_geojson(source: Path, target: Path, code_map_name: str, code_maps: dict) -> Path:
    with source.open(encoding="utf-8") as handle:
        data = json.load(handle)
    raw_mapping = code_maps.get(code_map_name, {})
    if not raw_mapping:
        raise RuntimeError(f"Missing administrative code map: {code_map_name}")
    mapping = {normalize_key(key): value for key, value in raw_mapping.items()}

    features = []
    missing = []
    for feature in data.get("features", []):
        props = feature.get("properties") or {}
        name = str(props.get("shapeName") or props.get("name") or "").strip()
        code = mapping.get(normalize_key(name))
        if not code:
            missing.append(name)
            continue
        features.append({
            "type": "Feature",
            "properties": {"admin_code": code, "name": name},
            "geometry": feature.get("geometry"),
        })

    if missing:
        raise RuntimeError(f"Unmapped administrative names for {code_map_name}: {missing}")
    if not features:
        raise RuntimeError(f"No features generated for {code_map_name}")

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return target


def canonical_source(country: dict, layer: dict, code_maps: dict) -> Path:
    api = layer.get("api") or {}
    if api.get("arcgis_layer_url"):
        target = TMP_DIR / f"{country['code']}_{layer['id']}_source.geojson"
        return download_arcgis_layer(api["arcgis_layer_url"], target)

    if api.get("gzip_path"):
        source_gzip = resolve_local_path(api["gzip_path"])
        target = PUBLIC_DIR / "countries" / country["code"] / f"{layer['id']}.geojson"
        target.parent.mkdir(parents=True, exist_ok=True)
        with gzip.open(source_gzip, "rb") as compressed:
            target.write_bytes(compressed.read())
        return target

    if api.get("url"):
        raw = TMP_DIR / f"{country['code']}_{layer['id']}_source.geojson"
        download(api["url"], raw)
        if api.get("transform") == "admin1_codes":
            target = PUBLIC_DIR / "countries" / country["code"] / f"{layer['admin_level']}.geojson"
            return transform_remote_geojson(raw, target, api["code_map"], code_maps)
        return raw

    if api.get("path"):
        return resolve_local_path(api["path"])

    if layer.get("id") == "zonas_ciudad_guatemala":
        return build_guatemala_zones()

    map_url = layer.get("data_url") or layer.get("map_url")
    if map_url and map_url.startswith("/"):
        local = PUBLIC_DIR / map_url.lstrip("/")
        if local.exists():
            return local

    raise RuntimeError(f"No source configured for {country['code']} / {layer['id']}")


def build_optimized_map(source: Path, layer: dict) -> None:
    map_url = layer.get("map_url")
    if not map_url or not map_url.startswith("/") or not map_url.endswith(".geojson"):
        return
    target = PUBLIC_DIR / map_url.lstrip("/")
    if target.resolve() == source.resolve():
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    tolerance = layer.get("simplify_tolerance")
    if tolerance is None:
        tolerance = 0.01 if layer.get("admin_level") == "admin1" else 0.002
    args = ["ogr2ogr", "-f", "GeoJSON", str(target), str(source), "-t_srs", "EPSG:4326"]
    if float(tolerance) > 0:
        args.extend(["-simplify", str(tolerance)])
    run(*args)


def build_downloads(source: Path, country: dict, layer: dict) -> None:
    downloads = layer.get("downloads") or {}
    if not downloads:
        return

    basename = (layer.get("api") or {}).get("basename") or f"converttomap_{country['code'].lower()}_{layer['id']}"
    shp_dir = TMP_DIR / f"shp_{country['code']}_{layer['id']}"

    for fmt, public_url in downloads.items():
        if not public_url.startswith("/"):
            continue
        target = PUBLIC_DIR / public_url.lstrip("/")
        target.parent.mkdir(parents=True, exist_ok=True)

        if fmt == "geojson":
            if target.resolve() == source.resolve():
                continue
            run("ogr2ogr", "-f", "GeoJSON", str(target), str(source), "-t_srs", "EPSG:4326")
        elif fmt == "gpkg":
            run("ogr2ogr", "-f", "GPKG", str(target), str(source), "-nln", basename)
        elif fmt == "kml":
            run("ogr2ogr", "-f", "KML", str(target), str(source), "-t_srs", "EPSG:4326", "-nln", basename)
        elif fmt == "shp":
            if shp_dir.exists():
                shutil.rmtree(shp_dir)
            shp_dir.mkdir(parents=True)
            run("ogr2ogr", "-f", "ESRI Shapefile", str(shp_dir), str(source), "-nln", basename, "-lco", "ENCODING=UTF-8")
            with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for part in shp_dir.iterdir():
                    archive.write(part, arcname=part.name)


def main() -> None:
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    if TMP_DIR.exists():
        shutil.rmtree(TMP_DIR)
    TMP_DIR.mkdir(parents=True)

    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    code_maps = json.loads(CODE_MAPS_PATH.read_text(encoding="utf-8"))

    for country in catalog["countries"]:
        print(f"\n=== {country['name']} ===")
        for layer in country["levels"]:
            print(f"-- {layer['name']}")
            source = canonical_source(country, layer, code_maps)
            build_optimized_map(source, layer)
            build_downloads(source, country, layer)

    print("\nGIS assets generated successfully.")


if __name__ == "__main__":
    main()
