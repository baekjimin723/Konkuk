#!/usr/bin/env python3
import json, re
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from zoneinfo import ZoneInfo
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

TARGET=Path("living-area-site/index.html")
STATUS=Path("living-area-site/shared-housing-status.json")
ARRAY_RE=re.compile(r"const listings=(\[.*?\]);\nconst qs=",re.S)

# Current provider category pages. We discover place IDs here every run instead of
# relying on a small hand-picked neighborhood seed list.
DISCOVERY_URLS=[
 "https://gobang.kr/share",
 "https://gobang.kr/coliving",
 "https://gobang.kr/gosi",
 "https://gobang.kr/map?p=houseList",
]

# Known live places are retained only as fallback in case a category page changes
# its client-rendering structure and temporarily exposes no place links.
FALLBACK_IDS=[
 6079,3609,6171,6566,9419,10102,9122,7535,11260,10822,11584,
 2168,8121,9305,11345,8519,11451,7436,3585,2908,10766,11715,
 13461,14211,6741,6600,16000,16685,5621,4447,7838
]

AREA_TIME={
 "서울특별시":{
  "광진구":10,"성동구":20,"강동구":25,"송파구":25,"동대문구":25,"중랑구":30,
  "중구":30,"종로구":30,"용산구":35,"강남구":35,"성북구":35,"노원구":40,
  "서초구":40,"동작구":40,"마포구":40,"관악구":45,"서대문구":45,"영등포구":45,
  "강북구":45,"도봉구":50,"양천구":50,"구로구":50,"금천구":55,"은평구":55,"강서구":60
 },
 "경기도":{
  "구리시":35,"하남시":40,"성남시":40,"남양주시":45,"과천시":45,"안양시":50,
  "광명시":50,"군포시":55,"광주시":55,"의정부시":60,"부천시":60,"고양시":60,
  "의왕시":60,"용인시":60,"시흥시":65,"김포시":70,"수원시":70,"안산시":75,
  "양주시":75,"양평군":75,"화성시":80,"파주시":80,"오산시":85,"가평군":85,
  "평택시":90,"동두천시":90,"이천시":90
 },
 "인천광역시":{
  "부평구":65,"계양구":65,"제물포구":70,"미추홀구":75,"서해구":75,
  "남동구":75,"검단구":80,"연수구":85,"영종구":90
 }
}

# Normalize legacy/current Incheon district labels into the labels used by 생활권ON.
INCHEON_ALIAS={
 "동구":"제물포구","중구":"제물포구",
 "서구":"서해구",
 "미추홀구":"미추홀구","남구":"미추홀구",
 "계양구":"계양구","부평구":"부평구","남동구":"남동구","연수구":"연수구",
 "검단구":"검단구","영종구":"영종구"
}

S=requests.Session()
S.headers.update({
 "User-Agent":"Mozilla/5.0 (compatible; LivingAreaON/1.0)",
 "Accept-Language":"ko-KR,ko;q=0.9"
})

def first_num(s):
 m=re.search(r"(\d+)",(s or "").replace(",",""))
 return int(m.group(1)) if m else 0

def discover_ids():
 ids=set(FALLBACK_IDS)
 discovered_by={}
 for url in DISCOVERY_URLS:
  try:r=S.get(url,timeout=10,allow_redirects=True)
  except Exception:
   discovered_by[url]=0
   continue
  if r.status_code>=400:
   discovered_by[url]=0
   continue
  found=set(int(x) for x in re.findall(r"/place/(\d+)",r.text))
  soup=BeautifulSoup(r.text,"html.parser")
  for a in soup.find_all("a",href=True):
   m=re.search(r"/place/(\d+)",urljoin(r.url,a.get("href","")))
   if m:found.add(int(m.group(1)))
  discovered_by[url]=len(found)
  ids.update(found)
 return sorted(ids),discovered_by

def parse_location(text):
 # Seoul
 m=re.search(r"서울\s+([가-힣]+구)\s+([가-힣0-9]+(?:동|가))",text)
 if m:
  province="서울특별시"; city=m.group(1); dong=m.group(2)
  if city in AREA_TIME[province]:
   return province,city,dong,AREA_TIME[province][city]

 # Gyeonggi: city + optional district + dong/eup/myeon
 m=re.search(r"경기\s+([가-힣]+시|[가-힣]+군)\s+(?:([가-힣]+구)\s+)?([가-힣0-9]+(?:동|읍|면|가))",text)
 if m:
  province="경기도"; city=m.group(1); district=m.group(2) or ""; local=m.group(3)
  if city in AREA_TIME[province]:
   dong=(district+" "+local).strip()
   return province,city,dong,AREA_TIME[province][city]

 # Incheon: district + dong. Map old/new district labels to site's labels.
 m=re.search(r"인천\s+([가-힣]+구)\s+([가-힣0-9]+(?:동|가))",text)
 if m:
  province="인천광역시"; raw_city=m.group(1); dong=m.group(2)
  city=INCHEON_ALIAS.get(raw_city,raw_city)
  if city in AREA_TIME[province]:
   return province,city,dong,AREA_TIME[province][city]

 return None

def parse_place(pid):
 url=f"https://gobang.kr/place/{pid}"
 try:r=S.get(url,timeout=8,allow_redirects=True)
 except Exception:return None
 if r.status_code>=400:return None

 soup=BeautifulSoup(r.text,"html.parser")
 text=soup.get_text(" ",strip=True)
 title=soup.title.get_text(" ",strip=True) if soup.title else ""
 if "페이지를 찾을 수 없습니다" in text or "삭제" in title:return None

 loc=parse_location(text)
 if not loc:return None
 province,city,dong,minutes=loc
 if minutes>90:return None

 joined=(title+" "+text).lower()
 if any(k in joined for k in ("코리빙하우스","코리빙","co-living","coliving","쉐어하우스","쉐어 하우스")):
  mode="쉐어하우스·코리빙"
 elif any(k in joined for k in ("기숙사형","기숙사","학생생활관","생활관")):
  mode="기숙사형 주거"
 elif any(k in joined for k in ("고시원","고시텔","원룸텔","리빙텔")):
  mode="고시원·원룸텔"
 else:
  # Only keep entries that are genuinely in the shared/compact housing families.
  return None

 rentm=re.search(r"월세\s*([0-9,]+)(?:\s*~\s*([0-9,]+))?만원",text)
 if not rentm:
  rentm=re.search(r"월 이용료\s*([0-9,]+)만원",text)
 if not rentm:return None
 rent_min=first_num(rentm.group(1))
 rent_max=first_num(rentm.group(2) if rentm.lastindex and rentm.lastindex>=2 else rentm.group(1))
 if rent_min>150:return None

 depm=re.search(r"보증금\s*(없음|[0-9,]+(?:\s*~\s*[0-9,]+)?만원)",text)
 dep_raw=depm.group(1) if depm else "없음"
 dep_min=0 if "없음" in dep_raw else first_num(dep_raw)
 if dep_min>18000:return None

 if "빌라/연립" in text or "빌라" in text or "연립" in text:typ="다세대·빌라"
 elif "오피스텔" in text:typ="오피스텔"
 elif "아파트" in text:typ="아파트"
 elif "도시형생활주택" in text:typ="도시형생활주택"
 else:typ="단독·다가구"

 layout="개인실" if mode in ("쉐어하우스·코리빙","기숙사형 주거") else "원룸"
 name=title.split(" - ")[0].strip() if " - " in title else title.strip()
 update=re.search(r"(\d{2}-\d{2}-\d{2})\s*업데이트",text)
 updated=update.group(1) if update else ""
 og=soup.find("meta",attrs={"property":"og:image"})
 photo=og.get("content","").strip() if og else ""

 note=f"고방 현재 등록 · 월세 {rent_min}"
 if rent_max and rent_max!=rent_min:note+=f"~{rent_max}"
 note+="만원"
 if updated:note+=f" · {updated} 업데이트"
 note+=" · 실제 공실은 원문 확인"

 item={
  "id":f"gobang-{pid}","province":province,"city":city,"dong":dong,
  "type":typ,"layout":layout,"livingMode":mode,"py":0,
  "dep":dep_min,"rent":rent_min,"time":minutes,"transfer":1,
  "source":"고방","url":url,"note":note,"name":name,
  "deal":"보증부월세","addedAt":datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat()
 }
 if photo:item["photo"]=photo
 return item

def main():
 src=TARGET.read_text(encoding="utf-8")
 m=ARRAY_RE.search(src)
 if not m:raise SystemExit("listings array not found")
 listings=json.loads(m.group(1))
 base=[x for x in listings if x.get("source")!="고방"]

 ids,discovered_by=discover_ids()
 shared=[];failed=[]
 with ThreadPoolExecutor(max_workers=12) as ex:
  futs={ex.submit(parse_place,pid):pid for pid in ids}
  for fut in as_completed(futs):
   pid=futs[fut]
   try:item=fut.result()
   except Exception:item=None
   if item:shared.append(item)
   else:failed.append(pid)

 # De-duplicate by provider place id and sort for deterministic commits.
 uniq={str(x["id"]):x for x in shared}
 shared=list(uniq.values())
 shared.sort(key=lambda x:(x["province"],x["city"],x["dong"],x["livingMode"],x["rent"],x["name"]))

 merged=shared+base
 compact=json.dumps(merged,ensure_ascii=False,separators=(",",":"))
 TARGET.write_text(src[:m.start(1)]+compact+src[m.end(1):],encoding="utf-8")

 by_mode={};by_province={};by_city={}
 for x in shared:
  by_mode[x["livingMode"]]=by_mode.get(x["livingMode"],0)+1
  by_province[x["province"]]=by_province.get(x["province"],0)+1
  key=x["province"]+" "+x["city"]
  by_city[key]=by_city.get(key,0)+1

 STATUS.write_text(json.dumps({
  "synced_at":datetime.now(ZoneInfo("Asia/Seoul")).isoformat(timespec="seconds"),
  "discovery_pages":discovered_by,
  "candidate_place_ids":len(ids),
  "shared_housing_added":len(shared),
  "by_mode":by_mode,
  "by_province":by_province,
  "by_city":dict(sorted(by_city.items(),key=lambda kv:(kv[0]))),
  "failed_or_out_of_scope_count":len(failed)
 },ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 print(json.dumps({"shared_housing_added":len(shared),"by_mode":by_mode,"by_province":by_province},ensure_ascii=False))

if __name__=="__main__":main()
