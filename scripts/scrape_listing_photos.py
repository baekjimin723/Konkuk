import json, os, re, time, base64
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException, WebDriverException
from PIL import Image
from io import BytesIO

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "living-area-site" / "index.html"
OUT_DIR = ROOT / "living-area-site" / "assets" / "listings"
OUT_DIR.mkdir(parents=True, exist_ok=True)

html = INDEX.read_text(encoding="utf-8")
m = re.search(r"const listings=(\[.*?\]);\nconst qs=", html, re.S)
if not m:
    raise SystemExit("Could not parse listings from index.html")
listings = json.loads(m.group(1))
SHARD_TOTAL = max(1, int(os.environ.get("SHARD_TOTAL", "1")))
SHARD_INDEX = int(os.environ.get("SHARD_INDEX", "0"))
all_count = len(listings)
listings = [x for i, x in enumerate(listings) if i % SHARD_TOTAL == SHARD_INDEX]
print(f"SHARD {SHARD_INDEX+1}/{SHARD_TOTAL}: {len(listings)} of {all_count} listings", flush=True)

opts = Options()
opts.add_argument("--headless=new")
opts.add_argument("--no-sandbox")
opts.add_argument("--disable-dev-shm-usage")
opts.add_argument("--disable-gpu")
opts.add_argument("--window-size=1440,1200")
opts.add_argument("--lang=ko-KR")
opts.add_argument("--disable-notifications")
opts.add_argument("--disable-popup-blocking")
opts.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36")
opts.page_load_strategy = "eager"

driver = webdriver.Chrome(options=opts)
driver.set_page_load_timeout(8)

BAD = ("logo","avatar","profile","icon","emoji","map","marker","banner","advert","ads","qrcode","qr","sprite","favicon","badge","button")
manifest = {}
results = []

def safe_id(v):
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", str(v))

def clean_page():
    try:
        driver.execute_script("""
        document.querySelectorAll('[role="dialog"], .modal, .popup, .toast, [class*="cookie"], [id*="cookie"], [class*="banner"]').forEach(el=>{
          const t=(el.innerText||'').toLowerCase();
          if(t.includes('cookie')||t.includes('쿠키')||t.includes('동의')||t.includes('앱에서')||t.includes('열기')) el.remove();
        });
        """)
    except Exception:
        pass

def candidate_images():
    out = []
    try:
        imgs = driver.find_elements(By.TAG_NAME, "img")
    except Exception:
        return out
    for el in imgs:
        try:
            if not el.is_displayed():
                continue
            rect = el.rect or {}
            w, h = float(rect.get("width",0)), float(rect.get("height",0))
            if w < 260 or h < 150:
                continue
            data = driver.execute_script("""
              const e=arguments[0], r=e.getBoundingClientRect();
              return {
                nw:e.naturalWidth||0, nh:e.naturalHeight||0,
                src:e.currentSrc||e.src||'',
                alt:e.alt||'',
                cls:e.className||'',
                y:r.top+window.scrollY,
                parent:(e.parentElement?.className||'')+' '+(e.parentElement?.id||'')
              }
            """, el)
            nw, nh = float(data.get("nw",0)), float(data.get("nh",0))
            if nw < 300 or nh < 180:
                continue
            text = " ".join([str(data.get("src","")),str(data.get("alt","")),str(data.get("cls","")),str(data.get("parent",""))]).lower()
            if any(k in text for k in BAD):
                continue
            ratio = w / max(h,1)
            if ratio < 0.65 or ratio > 2.6:
                continue
            y = float(data.get("y",9999))
            area = w*h
            score = area
            if y < 1800: score += 1800000
            if y < 900: score += 1200000
            if y < 500: score += 800000
            if 1.05 <= ratio <= 2.0: score += 100000
            if "photo" in text or "image" in text or "gallery" in text: score += 120000
            out.append((score, el, data))
        except Exception:
            continue
    return sorted(out, key=lambda x: x[0], reverse=True)

def candidate_backgrounds():
    js = """
    const all=[...document.querySelectorAll('*')], out=[];
    for(const e of all){
      const r=e.getBoundingClientRect();
      if(r.width<280||r.height<160) continue;
      const bg=getComputedStyle(e).backgroundImage||'';
      if(!bg.startsWith('url(')) continue;
      if(r.bottom<0||r.top>2500) continue;
      out.push({e,w:r.width,h:r.height,y:r.top+scrollY,bg});
    }
    out.sort((a,b)=>(b.w*b.h)-(a.w*a.h));
    return out.slice(0,20).map(x=>({w:x.w,h:x.h,y:x.y,bg:x.bg}));
    """
    try:
        arr = driver.execute_script(js)
    except Exception:
        return None
    # Re-find element by matching backgroundImage and approximate size
    for item in arr or []:
        bg = (item.get("bg") or "").lower()
        if any(k in bg for k in BAD):
            continue
        try:
            el = driver.execute_script("""
              const target=arguments[0];
              return [...document.querySelectorAll('*')].find(e=>getComputedStyle(e).backgroundImage===target) || null;
            """, item["bg"])
            if el:
                return el
        except Exception:
            pass
    return None

def save_element(el, path):
    try:
        png = el.screenshot_as_png
        im = Image.open(BytesIO(png)).convert("RGB")
        if im.width < 260 or im.height < 150:
            return False
        # Normalize to 4:3-ish card crop while preserving the real photo.
        max_w = 1000
        if im.width > max_w:
            ratio = max_w / im.width
            im = im.resize((max_w, int(im.height*ratio)))
        im.save(path, "JPEG", quality=88, optimize=True)
        return True
    except Exception:
        return False

for idx, listing in enumerate(listings, start=1):
    lid = safe_id(listing.get("id", idx))
    url = listing.get("url")
    if not url:
        continue
    out = OUT_DIR / f"{lid}.jpg"
    print(f"[{idx}/{len(listings)}] {lid} {url}", flush=True)
    try:
        try:
            driver.get(url)
        except TimeoutException:
            try:
                driver.execute_script("window.stop()")
            except Exception:
                pass
        time.sleep(1.0)
        clean_page()
        # Let lazy images settle.
        try:
            driver.execute_script("window.scrollTo(0, 350)")
            time.sleep(0.35)
            driver.execute_script("window.scrollTo(0, 0)")
        except Exception:
            pass

        chosen = None
        cands = candidate_images()
        if cands:
            chosen = cands[0][1]
        if chosen is None:
            chosen = candidate_backgrounds()

        ok = bool(chosen and save_element(chosen, out))
        if ok:
            rel = f"assets/listings/{lid}.jpg"
            manifest[str(listing["id"])] = rel
            results.append({"id": str(listing["id"]), "status": "ok", "url": url, "photo": rel})
            print(f"  saved {rel}", flush=True)
        else:
            results.append({"id": str(listing["id"]), "status": "no-photo", "url": url})
            print("  no suitable property image found", flush=True)
    except WebDriverException as e:
        results.append({"id": str(listing.get("id")), "status": "browser-error", "url": url, "error": str(e)[:180]})
        print("  browser error", str(e)[:120], flush=True)
    except Exception as e:
        results.append({"id": str(listing.get("id")), "status": "error", "url": url, "error": str(e)[:180]})
        print("  error", str(e)[:120], flush=True)

driver.quit()

# JS manifest loaded before the main app.
(OUT_DIR / f"manifest-shard-{SHARD_INDEX}.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
(OUT_DIR / f"scrape-report-shard-{SHARD_INDEX}.json").write_text(json.dumps({
    "shard_index": SHARD_INDEX,
    "shard_total": SHARD_TOTAL,
    "total": len(listings),
    "saved": len(manifest),
    "failed": len(listings)-len(manifest),
    "results": results
}, ensure_ascii=False, indent=2), encoding="utf-8")
if SHARD_TOTAL == 1:
    photos_js = "window.LISTING_PHOTOS=" + json.dumps(manifest, ensure_ascii=False, separators=(",",":")) + ";\n"
    (OUT_DIR / "photos.js").write_text(photos_js, encoding="utf-8")

print(f"DONE shard={SHARD_INDEX} saved={len(manifest)} failed={len(listings)-len(manifest)}", flush=True)
