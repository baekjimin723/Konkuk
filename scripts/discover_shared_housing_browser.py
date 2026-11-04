#!/usr/bin/env python3
import json, re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright

OUT=Path("living-area-site/shared-place-ids.json")
URLS=[
 "https://gobang.kr/share",
 "https://gobang.kr/coliving",
 "https://gobang.kr/gosi",
 "https://gobang.kr/map?p=houseList",
]

PATTERNS=[
 re.compile(r"/place/(\d+)"),
 re.compile(r'["\']placeId["\']\s*:\s*["\']?(\d+)'),
 re.compile(r'["\']place_id["\']\s*:\s*["\']?(\d+)'),
 re.compile(r'["\']placeNo["\']\s*:\s*["\']?(\d+)'),
 re.compile(r'["\']place_no["\']\s*:\s*["\']?(\d+)'),
]

def harvest(text,ids):
    if not text:return
    for pat in PATTERNS:
        for m in pat.findall(text):
            try:
                v=int(m)
                if 100 <= v <= 99999999: ids.add(v)
            except: pass

def collect(page,url):
    ids=set()
    network_text=[]

    def on_response(resp):
        try:
            ctype=(resp.headers.get("content-type") or "").lower()
            if "gobang.kr" not in resp.url:return
            if "json" not in ctype and "javascript" not in ctype:return
            txt=resp.text()
            if txt and len(txt)<=6_000_000:
                network_text.append(txt)
        except:
            pass

    page.on("response",on_response)
    page.goto(url,wait_until="domcontentloaded",timeout=60000)
    page.wait_for_timeout(2500)
    stagnant=0
    for _ in range(40):
        try:
            hrefs=page.locator('a[href*="/place/"]').evaluate_all("els => els.map(e => e.href)")
            for href in hrefs:harvest(href,ids)
        except: pass

        try:harvest(page.content(),ids)
        except: pass

        before=len(ids)
        page.mouse.wheel(0,4500)
        page.wait_for_timeout(500)
        if len(ids)==before:stagnant+=1
        else:stagnant=0
        if stagnant>=7:break

    for txt in network_text:
        harvest(txt,ids)
    page.remove_listener("response",on_response)
    return sorted(ids)

def main():
    by_page={}
    all_ids=set()
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True)
        context=browser.new_context(viewport={"width":1440,"height":1000},locale="ko-KR")
        page=context.new_page()
        for url in URLS:
            try:ids=collect(page,url)
            except Exception:ids=[]
            by_page[url]=len(ids)
            all_ids.update(ids)
        browser.close()

    previous=[]
    if OUT.exists():
        try:previous=json.loads(OUT.read_text(encoding="utf-8")).get("place_ids",[])
        except:previous=[]
    all_ids.update(int(x) for x in previous if str(x).isdigit())

    OUT.write_text(json.dumps({
        "discovered_at":datetime.now(ZoneInfo("Asia/Seoul")).isoformat(timespec="seconds"),
        "by_page":by_page,
        "place_count":len(all_ids),
        "place_ids":sorted(all_ids),
    },ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"place_count":len(all_ids),"by_page":by_page},ensure_ascii=False))

if __name__=="__main__":main()
