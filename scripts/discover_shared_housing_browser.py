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

def collect(page,url):
    page.goto(url,wait_until="domcontentloaded",timeout=60000)
    page.wait_for_timeout(2500)
    ids=set()
    stagnant=0
    for _ in range(35):
        hrefs=page.locator('a[href*="/place/"]').evaluate_all("els => els.map(e => e.href)")
        before=len(ids)
        for href in hrefs:
            m=re.search(r"/place/(\d+)",href or "")
            if m: ids.add(int(m.group(1)))
        if len(ids)==before: stagnant+=1
        else: stagnant=0
        if stagnant>=5: break
        page.mouse.wheel(0,4200)
        page.wait_for_timeout(450)
    return sorted(ids)

def main():
    by_page={}
    all_ids=set()
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True)
        page=browser.new_page(viewport={"width":1440,"height":1000},locale="ko-KR")
        for url in URLS:
            try:
                ids=collect(page,url)
            except Exception:
                ids=[]
            by_page[url]=len(ids)
            all_ids.update(ids)
        browser.close()

    previous=[]
    if OUT.exists():
        try: previous=json.loads(OUT.read_text(encoding="utf-8")).get("place_ids",[])
        except: previous=[]
    # Keep previously discovered IDs so temporary rendering/network changes do not erase coverage.
    all_ids.update(int(x) for x in previous if str(x).isdigit())

    OUT.write_text(json.dumps({
        "discovered_at":datetime.now(ZoneInfo("Asia/Seoul")).isoformat(timespec="seconds"),
        "by_page":by_page,
        "place_count":len(all_ids),
        "place_ids":sorted(all_ids),
    },ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"place_count":len(all_ids),"by_page":by_page},ensure_ascii=False))

if __name__=="__main__":main()
