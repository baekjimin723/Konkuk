#!/usr/bin/env python3
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

TARGET = Path("living-area-site/index.html")
STATUS = Path("living-area-site/listing-status.json")

ARRAY_RE = re.compile(r"const listings=(\[.*?\]);\nconst qs=", re.S)
INACTIVE_TERMS = (
    "숨김 처리된 게시글",
    "숨김 처리된 매물",
    "거래 완료된 게시글",
    "거래완료",
    "거래 완료",
    "계약완료",
    "계약 완료",
    "판매완료",
    "판매 완료",
    "삭제된 게시글",
    "삭제된 매물",
    "존재하지 않는 게시글",
    "존재하지 않는 매물",
    "매물을 찾을 수 없습니다",
    "페이지를 찾을 수 없습니다",
)

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (compatible; LivingAreaON/1.0; +https://baekjimin723.github.io/Konkuk/living-area-site/)",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.6",
})

def visible_text(raw: str) -> str:
    soup = BeautifulSoup(raw, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    body = soup.get_text(" ", strip=True)
    return html.unescape((title + " " + body)[:60000])

def check_listing(item):
    url = item.get("url", "")
    try:
        r = session.get(url, timeout=20, allow_redirects=True)
    except requests.RequestException as e:
        return "unknown", f"network:{type(e).__name__}"

    if r.status_code in (404, 410):
        return "inactive", f"http:{r.status_code}"
    if r.status_code == 429 or r.status_code >= 500:
        return "unknown", f"http:{r.status_code}"
    if r.status_code >= 400:
        return "unknown", f"http:{r.status_code}"

    text = visible_text(r.text)
    for term in INACTIVE_TERMS:
        if term in text:
            return "inactive", f"marker:{term}"

    source = item.get("source", "")
    final_url = r.url
    if source == "당근부동산" and "/articles/" not in final_url:
        return "inactive", "redirected-away-from-article"
    if source == "피터팬" and "/house/" not in final_url:
        return "inactive", "redirected-away-from-house"

    return "active", f"http:{r.status_code}"

def main():
    text = TARGET.read_text(encoding="utf-8")
    m = ARRAY_RE.search(text)
    if not m:
        raise SystemExit("Could not locate listings array.")

    listings = json.loads(m.group(1))
    active, removed, unknown = [], [], []

    for item in listings:
        state, reason = check_listing(item)
        record = {"id": str(item.get("id", "")), "source": item.get("source", ""), "url": item.get("url", ""), "reason": reason}
        if state == "inactive":
            removed.append(record)
        else:
            active.append(item)
            if state == "unknown":
                unknown.append(record)

    compact = json.dumps(active, ensure_ascii=False, separators=(",", ":"))
    new_text = text[:m.start(1)] + compact + text[m.end(1):]
    TARGET.write_text(new_text, encoding="utf-8")

    now = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    status = {
        "checked_at": now,
        "before": len(listings),
        "active_or_unconfirmed": len(active),
        "removed_this_run": len(removed),
        "unknown_this_run": len(unknown),
        "removed": removed,
        "unknown": unknown,
        "policy": "Definitive 404/410, provider redirect, or visible inactive marker only. Temporary/network failures are retained."
    }
    STATUS.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(status, ensure_ascii=False))

if __name__ == "__main__":
    main()
