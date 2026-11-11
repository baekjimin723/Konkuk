#!/usr/bin/env python3
"""Cache CC-licensed Wikimedia neighborhood photographs into this Pages site.

Uses Commons' official MediaWiki imageinfo API, validates image payloads, and
writes an attribution-preserving manifest. No generic page scraping.
"""
from __future__ import annotations

import hashlib
import io
import json
import re
import shutil
import time
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

import requests
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "living-area-site" / "explore.html"
OUTPUT = ROOT / "living-area-site" / "assets" / "areas"
OUTPUT.mkdir(parents=True, exist_ok=True)
USER_AGENT = "LivingAreaON/1.0 (Wikimedia Commons attribution-preserving school project; contact via GitHub baekjimin723/Konkuk)"
session = requests.Session()
session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json,image/*;q=0.8,*/*;q=0.5"})

source = SOURCE.read_text(encoding="utf-8")
match = re.search(r"const galleryByAreaV32=(\{.*?\});\s*\nlet rankedAreasV31", source, re.S)
if not match:
    raise RuntimeError("Cannot locate photo gallery metadata in explore.html")
raw_gallery = json.loads(match.group(1))
CATALOG = ROOT / "living-area-site" / "assets" / "areas" / "photo-catalog.json"
if CATALOG.exists():
    raw_gallery = json.loads(CATALOG.read_text(encoding="utf-8"))

def original_url(filename: str) -> str:
    digest = hashlib.md5(filename.replace(" ", "_").encode()).hexdigest()
    return f"https://upload.wikimedia.org/wikipedia/commons/{digest[0]}/{digest[:2]}/{quote(filename.replace(' ', '_'), safe='(),-_.')}" 

def official_urls(filename: str) -> list[str]:
    api = "https://commons.wikimedia.org/w/api.php"
    try:
        response = session.get(api, params={
            "action": "query", "format": "json", "prop": "imageinfo",
            "iiprop": "url", "iiurlwidth": "850", "titles": "File:" + filename,
        }, timeout=20)
        response.raise_for_status()
        info = list(response.json()["query"]["pages"].values())[0].get("imageinfo", [])
        if info:
            return [x for x in [info[0].get("thumburl"), info[0].get("url"), original_url(filename)] if x]
    except Exception as exc:
        print(f"  Wikimedia API unavailable for {filename}: {exc}", flush=True)
    return [original_url(filename)]

previous_manifest = OUTPUT / "manifest.json"
previous_files = {}
if previous_manifest.exists():
    for region_photos in json.loads(previous_manifest.read_text(encoding="utf-8")).values():
        for source in region_photos:
            if len(source) >= 5:
                previous_files[source[4]] = ROOT / "living-area-site" / source[0]

manifest: dict[str, list] = {}
success = 0
failures = []
for region, photos in raw_gallery.items():
    manifest[region] = []
    for i, photo in enumerate(photos):
        remote, label, author, license_name, file_page = photo
        filename = unquote(urlsplit(file_page).path.split("File:", 1)[-1]).replace("_", " ")
        local = OUTPUT / f"{hashlib.sha1((region+'|'+filename).encode()).hexdigest()[:16]}.webp"
        saved = False
        if local.exists() and local.stat().st_size > 2000:
            saved = True
        elif file_page in previous_files and previous_files[file_page].exists():
            shutil.copy2(previous_files[file_page], local)
            saved = local.stat().st_size > 2000
        if not saved:
            # Avoid burning Wikimedia's per-host rate budget on photos that
            # already exist in this repository.
            time.sleep(1.1)
            candidates = official_urls(filename)
            # Fall back to the source image link only when Commons' API/canonical
            # source does not serve an image.
            candidates.append(remote)
            for url in dict.fromkeys(candidates):
                try:
                    response = session.get(url, timeout=22)
                    response.raise_for_status()
                    if len(response.content) < 3000:
                        continue
                    with Image.open(io.BytesIO(response.content)) as im:
                        im = ImageOps.exif_transpose(im)
                        if im.width < 350 or im.height < 190:
                            continue
                        im = im.convert("RGB")
                        im.thumbnail((850, 640))
                        im.save(local, "WEBP", quality=78, method=5)
                        if local.stat().st_size < 2500:
                            local.unlink()
                            continue
                    saved = True
                    break
                except Exception as exc:
                    print(f"    failed {url[:100]}: {str(exc)[:125]}", flush=True)
        if saved:
            manifest[region].append([
                "assets/areas/" + local.name, label, author, license_name, file_page
            ])
            success += 1
            print(f"  cached {region} / {label}", flush=True)
        else:
            failures.append([region, label, filename])
            print(f"  NOT CACHED: {region} / {label}", flush=True)
        time.sleep(0.2)

(OUTPUT / "manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
(OUTPUT / "cache-report.json").write_text(
    json.dumps({"cached": success, "failed": failures}, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
print(json.dumps({"cached": success, "failed": failures}, ensure_ascii=False), flush=True)
if failures:
    raise RuntimeError(f"Could not cache {len(failures)} required neighborhood photos.")
if success < 5:
    raise RuntimeError("Fewer than five neighborhood photos cached; refusing incomplete cache.")
