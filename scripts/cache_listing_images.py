#!/usr/bin/env python3
import io, json, re, hashlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageOps

TARGET=Path("living-area-site/index.html")
ASSET_DIR=Path("living-area-site/assets/listings")
STATUS=Path("living-area-site/image-cache-status.json")
ARRAY_RE=re.compile(r"const listings=(\[.*?\]);\nconst qs=",re.S)

S=requests.Session()
S.headers.update({"User-Agent":"Mozilla/5.0","Accept-Language":"ko-KR,ko;q=0.9"})

BAD_WORDS=("logo","brand","banner","default","placeholder","profile","icon","avatar","og_default","share")
DAANGN_GOOD=("img.kr.gcp-karroter.net/realty/","realty/article/")
PETERPAN_GOOD=("peterpanz","house","room","upload","image")

def safe_name(item):
    raw=(str(item.get("source",""))+"-"+str(item.get("id",""))).encode("utf-8")
    return hashlib.sha1(raw).hexdigest()[:20]+".webp"

def candidates(item, raw, final_url):
    out=[]
    soup=BeautifulSoup(raw,"html.parser")

    current=item.get("photo","")
    if current and not current.startswith("./assets/"):
        out.append(current)

    for attrs in (
        {"property":"og:image"},
        {"name":"twitter:image"},
        {"property":"twitter:image"},
    ):
        tag=soup.find("meta",attrs=attrs)
        if tag and tag.get("content"):
            out.append(urljoin(final_url,tag.get("content").strip()))

    # JSON-LD often carries the real property photo.
    for tag in soup.find_all("script",attrs={"type":"application/ld+json"}):
        txt=tag.get_text(" ",strip=True)
        try:
            data=json.loads(txt)
        except:
            continue
        stack=[data]
        while stack:
            node=stack.pop()
            if isinstance(node,dict):
                img=node.get("image")
                if isinstance(img,str): out.append(urljoin(final_url,img))
                elif isinstance(img,list):
                    for x in img:
                        if isinstance(x,str): out.append(urljoin(final_url,x))
                stack.extend(node.values())
            elif isinstance(node,list):
                stack.extend(node)

    # Provider-specific realty image URLs embedded in app data.
    patterns=[
        r'https:\\/\\/img\.kr\.gcp-karroter\.net\\/realty\\/[^"\\]+',
        r'https://img\.kr\.gcp-karroter\.net/realty/[^"\s<]+',
        r'https://[^"\s<]*(?:peterpanz|room|house)[^"\s<]*\.(?:jpg|jpeg|png|webp)(?:\?[^"\s<]*)?'
    ]
    for pat in patterns:
        for m in re.findall(pat,raw,re.I):
            out.append(m.replace("\\/","/"))

    for img in soup.find_all("img",src=True):
        src=urljoin(final_url,img.get("src","").strip())
        if src.startswith("http"):
            out.append(src)

    seen=set(); cleaned=[]
    for u in out:
        if not u or u in seen: continue
        seen.add(u)
        lu=u.lower()
        if any(w in lu for w in BAD_WORDS): continue
        if item.get("source")=="당근부동산":
            if not any(g in lu for g in DAANGN_GOOD):
                continue
        elif item.get("source")=="피터팬":
            # Keep provider-hosted images, but reject obvious site chrome.
            if any(w in lu for w in ("logo","icon","banner","profile")):
                continue
        cleaned.append(u)
    return cleaned

def image_from_url(item,url):
    if not url or str(url).startswith("./assets/"):
        return None
    try:
        ir=S.get(url,timeout=8,allow_redirects=True)
    except:
        return None
    if ir.status_code>=400:return None
    ctype=(ir.headers.get("content-type") or "").lower()
    if "image" not in ctype and len(ir.content)<5000:return None
    try:
        im=Image.open(io.BytesIO(ir.content))
        im=ImageOps.exif_transpose(im).convert("RGB")
        if im.width<240 or im.height<140:return None
        fitted=ImageOps.fit(im,(640,360),method=Image.Resampling.LANCZOS,centering=(0.5,0.5))
        return fitted
    except:
        return None

def download_actual(item):
    # Newly synced provider rows already carry their verified OG/representative image.
    # Cache that first so a temporary 500 on the detail page does not delete a valid row.
    direct=item.get("photo","")
    im=image_from_url(item,direct)
    if im is not None:
        return item,im,direct

    try:
        r=S.get(item["url"],timeout=8,allow_redirects=True)
    except Exception as e:
        return item,None,"page:"+type(e).__name__
    if r.status_code>=400:
        return item,None,"page_http:"+str(r.status_code)

    for url in candidates(item,r.text,r.url):
        im=image_from_url(item,url)
        if im is not None:
            return item,im,url
    return item,None,"no_actual_image"

def main():
    text=TARGET.read_text(encoding="utf-8")
    m=ARRAY_RE.search(text)
    if not m: raise SystemExit("listings array not found")
    listings=json.loads(m.group(1))
    ASSET_DIR.mkdir(parents=True,exist_ok=True)

    cached=0; failed=[]
    with ThreadPoolExecutor(max_workers=10) as ex:
        futs={ex.submit(download_actual,item):item for item in listings}
        for fut in as_completed(futs):
            item,im,source=fut.result()
            if im is None:
                failed.append({"id":str(item.get("id")),"source":item.get("source"),"reason":source})
                continue
            fname=safe_name(item)
            out=ASSET_DIR/fname
            im.save(out,"WEBP",quality=68,method=6)
            item["photo"]="./assets/listings/"+fname
            cached+=1

    # Only show cards with a locally cached real listing image.
    good=[x for x in listings if str(x.get("photo","")).startswith("./assets/listings/") and (ASSET_DIR/Path(x["photo"]).name).exists()]
    removed=len(listings)-len(good)

    compact=json.dumps(good,ensure_ascii=False,separators=(",",":"))
    TARGET.write_text(text[:m.start(1)]+compact+text[m.end(1):],encoding="utf-8")

    keep={Path(x["photo"]).name for x in good}
    for p in ASSET_DIR.glob("*.webp"):
        if p.name not in keep:
            p.unlink(missing_ok=True)

    STATUS.write_text(json.dumps({
        "before":len(listings),
        "cached_real_photos":len(good),
        "removed_without_cached_real_photo":removed,
        "newly_cached_this_run":cached,
        "failed":failed
    },ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

if __name__=="__main__":
    main()
