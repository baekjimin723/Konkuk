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
        is_public_tour_photo = "tong.visitkorea.or.kr" in urlsplit(remote).netloc
        filename = (
            unquote(urlsplit(remote).path.rsplit("/", 1)[-1])
            if is_public_tour_photo
            else unquote(urlsplit(file_page).path.split("File:", 1)[-1]).replace("_", " ")
        )
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
            candidates = [remote] if is_public_tour_photo else official_urls(filename)
            # Official Korea Tourism Organization source supplies KOGL Type 1
            # images with attribution through the published tourism API.
            # Commons photos are retrieved through the original photo metadata.
            if not is_public_tour_photo:
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


# Separate keyword photographs: these are NOT the hero-slide photographs.
# Store only successfully validated local images; preserve earlier downloads.
KEYWORD_CATALOG = OUTPUT / "keyword-photo-catalog.json"
KEYWORD_MANIFEST = OUTPUT / "keyword-photo-manifest.json"
if KEYWORD_CATALOG.exists():
    keyword_source = json.loads(KEYWORD_CATALOG.read_text(encoding="utf-8"))
    previous_keyword = json.loads(KEYWORD_MANIFEST.read_text(encoding="utf-8")) if KEYWORD_MANIFEST.exists() else {}
    keyword_manifest = {}
    keyword_missing = []
    priority = ["인덕원역·관양동", "남양주시", "광진구", "구리시", "의정부시"]
    for city in [*priority, *[k for k in keyword_source if k not in priority]]:
        if city not in keyword_source:
            continue
        topics = keyword_source[city]
        keyword_manifest[city] = {}
        for topic, entry in topics.items():
            filename = entry["filename"]
            label = entry["label"]
            local = OUTPUT / ("keyword-" + hashlib.sha1((city+"|"+topic+"|"+filename).encode()).hexdigest()[:16] + ".webp")
            source_file = entry["source"]
            reused = False
            # Preserve previously downloaded local assets without redownloading
            prior = previous_keyword.get(city, {}).get(topic)
            if prior and prior.get("source") == source_file:
                src = ROOT / "living-area-site" / prior["src"]
                if src.exists() and src.stat().st_size > 2500:
                    if src != local:
                        shutil.copy2(src, local)
                    reused = True
            # Search older local catalog assets by filename URL, not by place name.
            if not reused:
                for photo in (manifest.get(city, []) + list(previous_manifest and [
                    p for arr in json.loads(previous_manifest.read_text(encoding="utf-8")).values() for p in arr
                ] or [])):
                    if len(photo) >= 5 and filename.lower() in unquote(photo[4]).replace("_", " ").lower():
                        src = ROOT / "living-area-site" / photo[0]
                        if src.exists() and src.stat().st_size > 2500:
                            shutil.copy2(src, local)
                            reused = True
                            break
            if not reused and local.exists() and local.stat().st_size > 2500:
                reused = True
            if not reused:
                # Commons thumbnail URLs from imageinfo are preferred over
                # raw originals, which intermittently return HTTP 429 in CI.
                try:
                    candidates = official_urls(filename)
                except Exception:
                    candidates = []
                candidates.append(original_url(filename))
                for candidate in dict.fromkeys(candidates):
                    for attempt in range(2):
                        try:
                            req = session.get(candidate, timeout=22)
                            if req.status_code == 429:
                                time.sleep(6 if attempt == 0 else 12)
                                continue
                            req.raise_for_status()
                            with Image.open(io.BytesIO(req.content)) as img:
                                img = ImageOps.exif_transpose(img)
                                if img.width < 350 or img.height < 190:
                                    continue
                                img = img.convert("RGB")
                                img.thumbnail((850, 640))
                                img.save(local, "WEBP", quality=78, method=5)
                            if local.stat().st_size > 2500:
                                reused = True
                                break
                        except Exception as exc:
                            print(f" Keyword image failed {city}/{topic}: {str(exc)[:110]}", flush=True)
                        time.sleep(1.0)
                    if reused:
                        break
                time.sleep(1.1)
            if reused:
                keyword_manifest[city][topic] = {
                    "src": "assets/areas/" + local.name,
                    "label": label,
                    "info": entry["info"],
                    "source": source_file,
                    "attribution": "Wikimedia Commons 원본 파일에서 저작자·라이선스 확인",
                }
                print(" keyword cached:", city, topic, local.name, flush=True)
            else:
                keyword_missing.append(city + "/" + topic + "/" + filename)
                print(" keyword MISSING:", city, topic, filename, flush=True)
    KEYWORD_MANIFEST.write_text(json.dumps(keyword_manifest, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    (OUTPUT/"keyword-photo-status.json").write_text(json.dumps({"cached":sum(len(x) for x in keyword_manifest.values()),"missing":keyword_missing}, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print("KEYWORD PHOTO CACHE", sum(len(x) for x in keyword_manifest.values()),"missing:",keyword_missing, flush=True)
