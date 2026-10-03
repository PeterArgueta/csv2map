#!/usr/bin/env python3
from __future__ import annotations

import gzip
import html
import json
import re
import shutil
import subprocess
import unicodedata
import urllib.request
import urllib.parse
import zipfile
import time
from pathlib import Path

FRONTEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = FRONTEND_DIR.parent
PUBLIC_DIR = FRONTEND_DIR / "public"
CATALOG_PATH = PUBLIC_DIR / "countries" / "catalog.json"
CODE_MAPS_PATH = PUBLIC_DIR / "countries" / "admin1_codes.json"
DOWNLOAD_DIR = PUBLIC_DIR / "downloads"
TMP_DIR = Path("/tmp/converttomap-build")


TRANSMETRO_OPERATIONAL_LINES = {
    1: {"label": "Línea 1", "color": "#5B2C83"},
    2: {"label": "Línea 2", "color": "#A68BC0"},
    6: {"label": "Línea 6", "color": "#FFD500"},
    7: {"label": "Línea 7", "color": "#A7A9AC"},
    12: {"label": "Línea 12", "color": "#F15A24"},
    13: {"label": "Línea 13", "color": "#78BE20"},
    18: {"label": "Línea 18", "color": "#00A3E0"},
}


def transmetro_line_number(properties: dict) -> int | None:
    preferred_keys = [
        "linea_num", "linea", "no_actual", "nombre", "descripcio", "layer",
        "ruta", "Ruta", "RUTA", "codigo", "Codigo", "CODIGO", "cod_ruta",
        "codigo_ruta", "id_ruta", "ID_RUTA", "route", "route_id",
        "ref", "name", "network", "operator",
    ]
    preferred = [properties.get(key) for key in preferred_keys]
    allowed = set(TRANSMETRO_OPERATIONAL_LINES)

    for value in preferred:
        if value is None:
            continue
        text = str(value).strip()
        if not text:
            continue

        compact = re.sub(r"[^0-9]", "", text)
        if compact.isdigit():
            number = int(compact)
            if number in allowed:
                return number

        match = re.search(r"(?:línea|linea|line|l)\s*[-_:]?\s*0?(1|2|6|7|12|13|18)(?!\d)", text, flags=re.IGNORECASE)
        if match:
            return int(match.group(1))

    joined = " ".join(str(value or "") for value in preferred)
    for number in (18, 13, 12, 7, 6, 2, 1):
        if re.search(rf"(?<!\d){number}(?!\d)", joined):
            return number
    return None


def download_transmetro_from_overpass(target: Path) -> Path:
    bbox = "14.50,-90.65,14.75,-90.40"
    query = f"""
[out:json][timeout:90];
(
  rel["route"="bus"]["network"~"Transmetro",i]({bbox});
  rel["route"="bus"]["operator"~"Transmetro|Municipalidad de Guatemala",i]({bbox});
  rel["route"="bus"]["name"~"Transmetro|Línea|Linea",i]({bbox});
  rel["route_master"="bus"]["network"~"Transmetro",i]({bbox});
);
out body geom;
"""
    endpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
    ]
    payload = None
    last_error = None
    for endpoint in endpoints:
        try:
            request = urllib.request.Request(
                endpoint,
                data=urllib.parse.urlencode({"data": query}).encode("utf-8"),
                headers={
                    "User-Agent": "ConvertToMap/1.0 (https://converttomap.com)",
                    "Accept": "application/json",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                method="POST",
            )
            with urllib.request.urlopen(request, timeout=150) as response:
                payload = json.loads(response.read().decode("utf-8"))
            break
        except Exception as exc:
            last_error = exc
            print(f"Overpass endpoint failed {endpoint}: {exc}")

    if payload is None:
        raise RuntimeError(f"All Overpass endpoints failed: {last_error}")

    features = []
    detected = set()
    relation_summaries = []
    for element in payload.get("elements", []):
        if element.get("type") != "relation":
            continue
        tags = element.get("tags") or {}
        line_number = transmetro_line_number(tags)
        relation_summaries.append({
            "id": element.get("id"),
            "ref": tags.get("ref"),
            "name": tags.get("name"),
            "network": tags.get("network"),
            "operator": tags.get("operator"),
            "line": line_number,
        })
        if line_number not in TRANSMETRO_OPERATIONAL_LINES:
            continue
        joined_tags = " ".join(str(v or "") for v in tags.values()).lower()
        if not any(token in joined_tags for token in ("transmetro", "municipalidad de guatemala")):
            continue

        style = TRANSMETRO_OPERATIONAL_LINES[line_number]
        for member_index, member in enumerate(element.get("members") or []):
            if member.get("type") != "way" or not member.get("geometry"):
                continue
            coords = [
                [point["lon"], point["lat"]]
                for point in member["geometry"]
                if "lon" in point and "lat" in point
            ]
            if len(coords) < 2:
                continue
            props = dict(tags)
            props.update({
                "linea_num": line_number,
                "linea": style["label"],
                "linea_color": style["color"],
                "osm_relation": element.get("id"),
                "osm_member": member_index,
            })
            features.append({
                "type": "Feature",
                "properties": props,
                "geometry": {"type": "LineString", "coordinates": coords},
            })
        detected.add(line_number)

    print("Overpass Transmetro candidates:", json.dumps(relation_summaries, ensure_ascii=False))
    missing = sorted(set(TRANSMETRO_OPERATIONAL_LINES) - detected)
    if missing:
        raise RuntimeError(f"Missing Transmetro relations in OpenStreetMap: {missing}")
    if not features:
        raise RuntimeError("OpenStreetMap returned no Transmetro route geometry")

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Prepared {len(features)} OSM route segments for Transmetro lines {sorted(detected)}")
    return target


def transform_transmetro_lines(source: Path, target: Path) -> Path:
    readable_source = source
    if source.suffix.lower() not in {".json", ".geojson"}:
        readable_source = TMP_DIR / "transmetro_source.geojson"
        run("ogr2ogr", "-f", "GeoJSON", str(readable_source), str(source), "-t_srs", "EPSG:4326")

    with readable_source.open(encoding="utf-8") as handle:
        data = json.load(handle)

    features = []
    detected = set()
    for feature in data.get("features", []):
        props = dict(feature.get("properties") or {})
        line_number = transmetro_line_number(props)
        if line_number not in TRANSMETRO_OPERATIONAL_LINES:
            continue

        style = TRANSMETRO_OPERATIONAL_LINES[line_number]
        props["linea_num"] = line_number
        props["linea"] = style["label"]
        props["linea_color"] = style["color"]
        feature = {
            "type": "Feature",
            "properties": props,
            "geometry": feature.get("geometry"),
        }
        features.append(feature)
        detected.add(line_number)

    missing = sorted(set(TRANSMETRO_OPERATIONAL_LINES) - detected)
    if missing:
        raise RuntimeError(f"Missing operational Transmetro lines in source: {missing}")
    if not features:
        raise RuntimeError("No operational Transmetro features generated")

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Prepared {len(features)} Transmetro features for lines {sorted(detected)}")
    return target


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


def fetch_json(url: str, params: dict[str, object], attempts: int = 5) -> dict:
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(
        f"{url}?{query}",
        headers={
            "User-Agent": "Mozilla/5.0 ConvertToMap/1.0",
            "Accept": "application/json,text/plain,*/*",
        },
    )
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            last_error = exc
            if attempt == attempts:
                break
            wait = min(30, 3 * attempt)
            print(f"ArcGIS request failed ({attempt}/{attempts}): {exc}; retrying in {wait}s")
            time.sleep(wait)
    raise RuntimeError(f"ArcGIS request failed after {attempts} attempts: {last_error}")


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
    arcgis_urls = api.get("arcgis_layer_urls") or ([api["arcgis_layer_url"]] if api.get("arcgis_layer_url") else [])
    if arcgis_urls:
        cache_path = api.get("cache_path")
        if cache_path:
            target = REPO_DIR / cache_path
            if target.exists() and target.stat().st_size > 100:
                print(f"Using cached source {target}")
                return target
            target.parent.mkdir(parents=True, exist_ok=True)
        else:
            target = TMP_DIR / f"{country['code']}_{layer['id']}_source.geojson"

        errors = []
        for layer_url in arcgis_urls:
            try:
                print(f"Trying ArcGIS source {layer_url}")
                downloaded = download_arcgis_layer(layer_url, target)
                if api.get("transform") == "transmetro_operational_lines":
                    return transform_transmetro_lines(downloaded, target)
                return downloaded
            except Exception as exc:
                errors.append(f"{layer_url}: {exc}")
                print(f"ArcGIS source failed: {exc}")
        raise RuntimeError("All ArcGIS sources failed:\n" + "\n".join(errors))

    if api.get("ckan_package_url"):
        package_url = api["ckan_package_url"].rstrip("/")
        package_id = api["ckan_package_id"]
        resource_url = None

        try:
            payload = fetch_json(package_url, {"id": package_id}, attempts=1)
            resources = (payload.get("result") or {}).get("resources") or []

            def resource_score(resource: dict) -> tuple[int, int]:
                fmt = str(resource.get("format") or "").lower()
                url = str(resource.get("url") or "").lower()
                name = str(resource.get("name") or "").lower()
                is_shape = any(token in fmt for token in ("shp", "shape")) or "shape" in name
                is_zip = url.endswith(".zip") or "zip" in fmt
                return (2 if is_shape else 0, 1 if is_zip else 0)

            if resources:
                resource = max(resources, key=resource_score)
                resource_url = resource.get("url")
        except Exception as exc:
            print(f"CKAN API unavailable ({exc}); trying public dataset page")

        if not resource_url and api.get("ckan_dataset_url"):
            dataset_url = api["ckan_dataset_url"]
            request = urllib.request.Request(
                dataset_url,
                headers={
                    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Referer": "https://gis.muniguate.com/",
                },
            )
            try:
                with urllib.request.urlopen(request, timeout=180) as response:
                    page = response.read().decode("utf-8", errors="replace")
                hrefs = [
                    html.unescape(value)
                    for value in re.findall(r'href=["\\\']([^"\\\']+)["\\\']', page, flags=re.IGNORECASE)
                ]
                candidates = [
                    urllib.parse.urljoin(dataset_url, href)
                    for href in hrefs
                    if "/download/" in href.lower()
                    or href.lower().endswith((".zip", ".shp", ".geojson", ".gpkg"))
                ]
                if candidates:
                    resource_url = next(
                        (url for url in candidates if url.lower().endswith(".zip")),
                        candidates[0],
                    )
            except Exception as exc:
                print(f"CKAN public page unavailable ({exc})")

        if not resource_url:
            if api.get("overpass_fallback") == "transmetro":
                print(f"Could not resolve CKAN resource for {package_id}; using OpenStreetMap route relations")
                target = TMP_DIR / f"{country['code']}_{layer['id']}_overpass.geojson"
                return download_transmetro_from_overpass(target)
            raise RuntimeError(f"Could not resolve a downloadable CKAN resource for {package_id}")

        cache_path = api.get("archive_cache_path")
        archive_path = REPO_DIR / cache_path if cache_path else TMP_DIR / f"{country['code']}_{layer['id']}_ckan.zip"
        if not archive_path.exists() or archive_path.stat().st_size < 100:
            download(str(resource_url), archive_path)
        else:
            print(f"Using cached CKAN archive {archive_path}")

        extract_dir = TMP_DIR / f"ckan_{country['code']}_{layer['id']}"
        if extract_dir.exists():
            shutil.rmtree(extract_dir)
        extract_dir.mkdir(parents=True)

        if zipfile.is_zipfile(archive_path):
            with zipfile.ZipFile(archive_path) as archive:
                archive.extractall(extract_dir)
            candidates = list(extract_dir.rglob("*.shp"))
            if not candidates:
                raise RuntimeError(f"No shapefile found in CKAN resource: {resource_url}")
            source_path = candidates[0]
        else:
            source_path = archive_path

        if api.get("transform") == "transmetro_operational_lines":
            target = TMP_DIR / f"{country['code']}_{layer['id']}_normalized.geojson"
            return transform_transmetro_lines(source_path, target)
        return source_path

    if api.get("archive_url"):
        cache_path = api.get("archive_cache_path")
        archive_path = REPO_DIR / cache_path if cache_path else TMP_DIR / f"{country['code']}_{layer['id']}.zip"
        if not archive_path.exists() or archive_path.stat().st_size < 100:
            download(api["archive_url"], archive_path)
        else:
            print(f"Using cached archive {archive_path}")

        extract_dir = TMP_DIR / f"archive_{country['code']}_{layer['id']}"
        if extract_dir.exists():
            shutil.rmtree(extract_dir)
        extract_dir.mkdir(parents=True)
        with zipfile.ZipFile(archive_path) as archive:
            archive.extractall(extract_dir)

        member = api.get("archive_member")
        if member:
            matches = list(extract_dir.rglob(member))
            if not matches:
                raise RuntimeError(f"Archive member not found: {member}")
            return matches[0]

        candidates = list(extract_dir.rglob("*.shp"))
        if not candidates:
            raise RuntimeError(f"No shapefile found in archive: {api['archive_url']}")
        return candidates[0]

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
    args = [
        "ogr2ogr", "-f", "GeoJSON", str(target), str(source),
        "-t_srs", "EPSG:4326",
        "-lco", "COORDINATE_PRECISION=5",
    ]
    if layer.get("map_filter"):
        args.extend(["-where", str(layer["map_filter"])])
    if layer.get("map_fields"):
        args.extend(["-select", ",".join(str(field) for field in layer["map_fields"])])
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
            run("ogr2ogr", "-f", "ESRI Shapefile", str(shp_dir), str(source), "-nln", basename, "-unsetFieldWidth", "-lco", "ENCODING=UTF-8")
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
