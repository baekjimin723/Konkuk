#!/usr/bin/env python3
import json, re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

TARGET=Path("living-area-site/index.html")
STATUS=Path("living-area-site/shared-housing-status.json")
ARRAY_RE=re.compile(r"const listings=(\[.*?\]);\nconst qs=",re.S)

SEEDS=[
  6079,3609,6171,6566,9419,10102,9122,7535,11260,
  10822,11584,2168,8121,9305,11345,8519,11451,7436,3585
]

SEOUL_TIME={
 "광진구":10,"성동구":20,"강동구":25,"송파구":25,"동대문구":25,"중랑구":30,
 "중구":30,"종로구":30,"용산구":35,"강남구":35,"성북구":35,"노원구":40,
 "서초구":40,"동작구":40,"마포구":40,"관악구":45,"서대문구":45,"영등포구":45,
 "강북구":45,"도봉구":50,"양천구":50,"구로구":50,"금천구":55,"은평구":55,"강서구":60
}

S=requests.Session()
S.headers.update({"User-Agent":"Mozilla/5.0","Accept-Language":"ko-KR,ko;q=0.9"})

def first_num(s):
 m=re.search(r"(\d+)",s.replace(",",""))
 return int(m.group(1)) if m else 0

def parse_place(pid):
 url=f"https://gobang.kr/place/{pid}"
 try:
  r=S.get(url,timeout=10,allow_redirects=True)
 except Exception:
  return None
 if r.status_code>=400:return None
 soup=BeautifulSoup(r.text,"html.parser")
 text=soup.get_text(" ",strip=True)
 title=soup.title.get_text(" ",strip=True) if soup.title else ""

 if "페이지를 찾을 수 없습니다" in text or "삭제" in title:
  return None

 loc=re.search(r"서울\s+([가-힣]+구)\s+([가-힣0-9]+(?:동|가))",text)
 if not loc:return None
 city,dong=loc.group(1),loc.group(2)
 if city not in SEOUL_TIME:return None

 rentm=re.search(r"월세\s*([0-9,]+)(?:\s*~\s*([0-9,]+))?만원",text)
 if not rentm:return None
 rent_min=first_num(rentm.group(1))
 rent_max=first_num(rentm.group(2) or rentm.group(1))

 depm=re.search(r"보증금\s*(없음|[0-9,]+(?:\s*~\s*[0-9,]+)?만원)",text)
 dep_raw=depm.group(1) if depm else "없음"
 dep_min=0 if "없음" in dep_raw else first_num(dep_raw)

 joined=(title+" "+text).lower()
 if "코리빙하우스" in joined or "쉐어하우스" in joined:
  mode="쉐어하우스·코리빙"
 else:
  mode="고시원·원룸텔"

 if "빌라/연립" in text or "빌라" in text:
  typ="다세대·빌라"
 elif "오피스텔" in text:
  typ="오피스텔"
 elif "아파트" in text:
  typ="아파트"
 else:
  typ="단독·다가구"

 if mode=="쉐어하우스·코리빙":
  layout="개인실"
 else:
  layout="원룸"

 name=title.split(" - ")[0].strip() if " - " in title else title.strip()
 update=re.search(r"(\d{2}-\d{2}-\d{2})\s*업데이트",text)
 updated=update.group(1) if update else ""

 og=soup.find("meta",attrs={"property":"og:image"})
 photo=og.get("content","").strip() if og else ""

 note=f"고방 현재 등록 · 월세 {rent_min}"
 if rent_max!=rent_min: note+=f"~{rent_max}"
 note+="만원"
 if updated: note+=f" · {updated} 업데이트"
 note+=" · 실제 공실은 원문 확인"

 item={
   "id":f"gobang-{pid}",
   "province":"서울특별시",
   "city":city,
   "dong":dong,
   "type":typ,
   "layout":layout,
   "livingMode":mode,
   "py":0,
   "dep":dep_min,
   "rent":rent_min,
   "time":SEOUL_TIME[city],
   "transfer":1,
   "source":"고방",
   "url":url,
   "note":note,
   "name":name,
   "deal":"보증부월세",
   "addedAt":datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat()
 }
 if photo:item["photo"]=photo
 return item

def main():
 src=TARGET.read_text(encoding="utf-8")
 m=ARRAY_RE.search(src)
 if not m:raise SystemExit("listings array not found")
 listings=json.loads(m.group(1))

 # Replace the previous Gobang shared-housing snapshot atomically.
 base=[x for x in listings if x.get("source")!="고방"]
 shared=[]
 failed=[]
 for pid in SEEDS:
  item=parse_place(pid)
  if item: shared.append(item)
  else: failed.append(pid)

 merged=shared+base
 compact=json.dumps(merged,ensure_ascii=False,separators=(",",":"))
 TARGET.write_text(src[:m.start(1)]+compact+src[m.end(1):],encoding="utf-8")
 counts={}
 for x in shared:
  counts[x["livingMode"]]=counts.get(x["livingMode"],0)+1
 STATUS.write_text(json.dumps({
   "synced_at":datetime.now(ZoneInfo("Asia/Seoul")).isoformat(timespec="seconds"),
   "seed_count":len(SEEDS),
   "shared_housing_added":len(shared),
   "by_mode":counts,
   "failed_seed_ids":failed
 },ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 print(json.dumps({"shared_housing_added":len(shared),"by_mode":counts,"failed":failed},ensure_ascii=False))

if __name__=="__main__":main()
