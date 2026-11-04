#!/usr/bin/env python3
import json, re
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

TARGET=Path("living-area-site/index.html")
STATUS=Path("living-area-site/shared-housing-status.json")
ARRAY_RE=re.compile(r"const listings=(\[.*?\]);\nconst qs=",re.S)

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
PROVINCE_CODES={"서울특별시":"11","경기도":"41","인천광역시":"28"}
INCHEON_ALIAS={
 "동구":"제물포구","중구":"제물포구","서구":"서해구","남구":"미추홀구",
 "미추홀구":"미추홀구","계양구":"계양구","부평구":"부평구","남동구":"남동구",
 "연수구":"연수구","검단구":"검단구","영종구":"영종구"
}
GROUPS=[
 ("쉐어하우스·코리빙",["SHARE_HOUSE"]),
 ("쉐어하우스·코리빙",["CO_LIVING_HOUSE"]),
 ("고시원·원룸텔",["GOSIWON","ONE_ROOM_TEL"]),
]
PER_CITY_MODE_LIMIT=10
PAGE_SIZE=100
MAX_PAGES=40

S=requests.Session()
S.headers.update({
 "User-Agent":"Mozilla/5.0 (compatible; LivingAreaON/1.0)",
 "Accept-Language":"ko-KR,ko;q=0.9",
 "Origin":"https://gobang.kr",
 "Referer":"https://gobang.kr/"
})

def parse_location(full_name):
 text=(full_name or "").strip()
 m=re.search(r"서울\s+([가-힣]+구)\s+(.+)$",text)
 if m:
  p="서울특별시"; city=m.group(1); dong=m.group(2).strip()
  if city in AREA_TIME[p]:return p,city,dong,AREA_TIME[p][city]

 m=re.search(r"경기\s+([가-힣]+시|[가-힣]+군)\s+(?:([가-힣]+구)\s+)?(.+)$",text)
 if m:
  p="경기도";city=m.group(1);district=m.group(2) or "";local=m.group(3).strip()
  if city in AREA_TIME[p]:
   return p,city,(district+" "+local).strip(),AREA_TIME[p][city]

 m=re.search(r"인천\s+([가-힣]+구)\s+(.+)$",text)
 if m:
  p="인천광역시";city=INCHEON_ALIAS.get(m.group(1),m.group(1));dong=m.group(2).strip()
  if city in AREA_TIME[p]:return p,city,dong,AREA_TIME[p][city]
 return None

def fetch_group(province,code,house_types):
 rows=[]
 for page in range(1,MAX_PAGES+1):
  params=[("dongliCode",code)]
  params += [("houseTypes",t) for t in house_types]
  params += [("pageNo",page),("pageSize",PAGE_SIZE),("randomSeed",20261104)]
  try:r=S.get("https://api.gobang.kr/v2/houses",params=params,timeout=12)
  except Exception:break
  if r.status_code>=400:break
  try:data=r.json()
  except Exception:break
  batch=data.get("result",[]) if isinstance(data,dict) else []
  if not isinstance(batch,list) or not batch:break
  rows.extend(batch)
  if len(batch)<PAGE_SIZE:break
 return rows

def to_listing(row,mode,existing):
 no=row.get("no")
 if not no:return None
 loc=parse_location(row.get("eupmyeondongFullName",""))
 if not loc:return None
 province,city,dong,minutes=loc
 if minutes>90:return None

 rent=int(row.get("minPrice") or 0)
 dep=int(row.get("minDeposit") or 0)
 if rent>150 or dep>18000:return None

 types=set(row.get("houseTypes") or [])
 actual_mode=mode
 if "CO_LIVING_HOUSE" in types or "SHARE_HOUSE" in types:actual_mode="쉐어하우스·코리빙"
 elif "GOSIWON" in types or "ONE_ROOM_TEL" in types:actual_mode="고시원·원룸텔"

 item={
  "id":f"gobang-{no}",
  "province":province,"city":city,"dong":dong,
  "type":"미확인",
  "layout":"개인실" if actual_mode=="쉐어하우스·코리빙" else "원룸",
  "livingMode":actual_mode,"py":0,
  "dep":dep,"rent":rent,"time":minutes,"transfer":1,
  "source":"고방","url":f"https://gobang.kr/place/{no}",
  "note":f"고방 API 현재 등록 · 월세 {rent}~{int(row.get('maxPrice') or rent)}만원 · 실제 공실은 원문 확인",
  "name":row.get("name") or f"고방 {no}",
  "deal":"보증부월세",
  "addedAt":datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat()
 }
 old=existing.get(str(item["id"]))
 if old and str(old.get("photo","")).startswith("./assets/listings/"):
  item["photo"]=old["photo"]
 return item

def main():
 src=TARGET.read_text(encoding="utf-8")
 m=ARRAY_RE.search(src)
 if not m:raise SystemExit("listings array not found")
 listings=json.loads(m.group(1))
 existing={str(x.get("id")):x for x in listings}
 base=[x for x in listings if x.get("source")!="고방"]

 raw=[]
 api_counts={}
 for province,code in PROVINCE_CODES.items():
  for mode,types in GROUPS:
   rows=fetch_group(province,code,types)
   api_counts[province+"|"+"+".join(types)]=len(rows)
   for row in rows:
    item=to_listing(row,mode,existing)
    if item:raw.append(item)

 # Dedupe because an operator can appear in both SHARE_HOUSE and CO_LIVING_HOUSE.
 uniq={str(x["id"]):x for x in raw}
 rows=list(uniq.values())

 # Geographic balance: keep up to N current listings per city and residence mode,
 # sorted by lower monthly rent first. This prevents one district from dominating.
 buckets=defaultdict(list)
 for x in rows:buckets[(x["province"],x["city"],x["livingMode"])].append(x)
 shared=[]
 for key,vals in buckets.items():
  vals.sort(key=lambda x:(x["rent"],x["dep"],x["name"],x["id"]))
  shared.extend(vals[:PER_CITY_MODE_LIMIT])
 shared.sort(key=lambda x:(x["province"],x["city"],x["livingMode"],x["rent"],x["name"]))

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
  "source":"https://api.gobang.kr/v2/houses",
  "api_counts":api_counts,
  "eligible_before_city_cap":len(rows),
  "per_city_mode_limit":PER_CITY_MODE_LIMIT,
  "shared_housing_added":len(shared),
  "by_mode":by_mode,
  "by_province":by_province,
  "by_city":dict(sorted(by_city.items()))
 },ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 print(json.dumps({"eligible":len(rows),"shared_housing_added":len(shared),"by_province":by_province,"by_mode":by_mode},ensure_ascii=False))

if __name__=="__main__":main()
