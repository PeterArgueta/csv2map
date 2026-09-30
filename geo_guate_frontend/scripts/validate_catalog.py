#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

FRONTEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = FRONTEND_DIR.parent
PUBLIC_DIR = FRONTEND_DIR / "public"
CATALOG_PATH = PUBLIC_DIR / "countries" / "catalog.json"


def fail(message: str) -> None:
    raise SystemExit(f"Catalog QA failed: {message}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check-assets", action="store_true", help="Verify generated local map and download assets.")
    args = parser.parse_args()

    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    countries = catalog.get("countries") or []
    if not countries:
        fail("no countries configured")

    country_codes: set[str] = set()
    download_paths: set[str] = set()

    for country in countries:
        code = country.get("code")
        if not code or code in country_codes:
            fail(f"invalid or duplicate country code: {code!r}")
        country_codes.add(code)

        levels = country.get("levels") or []
        if not levels:
            fail(f"{code}: no layers configured")

        layer_ids: set[str] = set()
        for layer in levels:
            layer_id = layer.get("id")
            if not layer_id or layer_id in layer_ids:
                fail(f"{code}: invalid or duplicate layer id: {layer_id!r}")
            layer_ids.add(layer_id)

            map_url = layer.get("map_url")
            valid_map_url = isinstance(map_url, str) and (
                map_url.startswith("/") or (layer.get("remote_live") and map_url.startswith("https://"))
            )
            if not valid_map_url:
                fail(f"{code}/{layer_id}: invalid map_url")

            if not layer.get("name") or not layer.get("name_property"):
                fail(f"{code}/{layer_id}: missing name or name_property")

            count = layer.get("count")
            if count is not None and (not isinstance(count, int) or count <= 0):
                fail(f"{code}/{layer_id}: invalid feature count")

            for public_url in (layer.get("downloads") or {}).values():
                valid_download_url = isinstance(public_url, str) and (
                    public_url.startswith("/") or (layer.get("remote_live") and public_url.startswith("https://"))
                )
                if not valid_download_url:
                    fail(f"{code}/{layer_id}: invalid download URL {public_url!r}")
                if public_url in download_paths:
                    fail(f"duplicate download URL: {public_url}")
                download_paths.add(public_url)

            if args.check_assets:
                if isinstance(map_url, str) and map_url.startswith("/"):
                    map_path = PUBLIC_DIR / map_url.lstrip("/")
                    if not map_path.exists() or map_path.stat().st_size == 0:
                        fail(f"{code}/{layer_id}: missing generated map asset {map_url}")
                for public_url in (layer.get("downloads") or {}).values():
                    if isinstance(public_url, str) and public_url.startswith("/"):
                        download_path = PUBLIC_DIR / public_url.lstrip("/")
                        if not download_path.exists() or download_path.stat().st_size == 0:
                            fail(f"{code}/{layer_id}: missing generated download asset {public_url}")

            api = layer.get("api") or {}
            if api.get("path"):
                path = REPO_DIR / api["path"]
                if not path.exists():
                    fail(f"{code}/{layer_id}: missing api.path {api['path']}")
            if api.get("gzip_path"):
                path = REPO_DIR / api["gzip_path"]
                if not path.exists():
                    fail(f"{code}/{layer_id}: missing gzip source {api['gzip_path']}")

            georeference = (
                not layer.get("download_only")
                and layer.get("admin_level") in {"admin1", "admin2"}
            )
            if georeference:
                if not layer.get("code_property"):
                    fail(f"{code}/{layer_id}: georeference layer missing code_property")
                if not isinstance(layer.get("code_width"), int):
                    fail(f"{code}/{layer_id}: georeference layer missing code_width")
                if not api.get("code_field"):
                    fail(f"{code}/{layer_id}: georeference layer missing api.code_field")

    default_country = catalog.get("default_country")
    if default_country not in country_codes:
        fail(f"default_country {default_country!r} is not configured")

    print(
        f"Catalog QA OK: {len(countries)} countries, "
        f"{sum(len(c['levels']) for c in countries)} layers"
        + (" with built assets verified." if args.check_assets else ".")
    )


if __name__ == "__main__":
    main()
