#!/usr/bin/env python3
import json, re, time
from datetime import datetime
from pathlib import Path
from urllib.parse import quote, urljoin
from zoneinfo import ZoneInfo
import requests
from bs4 import BeautifulSoup

TARGET=Path("living-area-site/index.html")
STATUS=Path("living-area-site/sync-status.json")
ARRAY_RE=re.compile(r"const listings=(\[.*?\]);\nconst qs=",re.S)

AREAS={
 "서울특별시":{"광진구":10,"성동구":20,"강동구":25,"송파구":25,"동대문구":25,"중랑구":30,"중구":30,"종로구":30,"용산구":35,"강남구":35,"성북구":35,"노원구":40,"서초구":40,"동작구":40,"마포구":40,"관악구":45,"서대문구":45,"영등포구":45,"강북구":45,"도봉구":50,"양천구":50,"구로구":50,"금천구":55,"은평구":55,"강서구":60},
 "경기도":{"구리시":35,"하남시":40,"성남시":40,"남양주시":45,"과천시":45,"안양시":50,"광명시":50,"군포시":55,"광주시":55,"의정부시":60,"부천시":60,"고양시":60,"의왕시":60,"용인시":60,"시흥시":65,"김포시":70,"수원시":70,"안산시":75,"양주시":75,"양평군":75,"화성시":80,"파주시":80,"오산시":85,"가평군":85,"평택시":90,"동두천시":90,"이천시":90},
 "인천광역시":{"부평구":65,"계양구":65,"제물포구":70,"미추홀구":75,"서해구":75,"남동구":75,"검단구":80,"연수구":85,"영종구":90}
}

NON_HOME=("상가","사무실","건물","공장","창고","토지","점포")
INACTIVE=("숨김 처리된 게시글","거래완료","거래 완료","계약완료","삭제된 게시글","페이지를 찾을 수 없습니다")
S=requests.Session()
S.headers.update({"User-Agent":"Mozilla/5.0","Accept-Language":"ko-KR,ko;q=0.9"})

def money(s):
 s=s.replace("만원","").replace("원","").replace(",","").replace(" ","")
 if "억" in s:
  a,b=s.split("억",1)
  try: total=int(float(a))*10000
  except: return None
  b=re.sub(r"[^0-9.]","",b)
  return total+(int(float(b)) if b else 0)
 d=re.sub(r"[^0-9.]","",s)
 try:return int(float(d)) if d else None
 except:return None

def price(title):
 m=re.search(r"\s(월세|전세)\s+(.+?)\s*\|\s*당근부동산",title)
 if not m:return None
 deal,raw=m.group(1),m.group(2)
 if deal=="전세":
  dep=money(raw); return (deal,dep,0) if dep is not None else None
 if "/" not in raw:return None
 a,b=raw.split("/",1); dep,rent=money(a),money(b)
 return (deal,dep,rent) if dep is not None and rent is not None else None

def living_mode(title,text):
 joined=(title+" "+text).lower()
 if any(k in joined for k in ("쉐어하우스","쉐어 하우스","share house","코리빙","co-living","coliving","공유주택","공유 주택")):
  return "쉐어하우스·코리빙"
 if any(k in joined for k in ("기숙사형","기숙사","학생생활관","생활관")):
  return "기숙사형 주거"
 if any(k in joined for k in ("고시원","고시텔","원룸텔","리빙텔")):
  return "고시원·원룸텔"
 return "일반주거"

def parse_article(url,province,city,minutes):
 try:r=S.get(url,timeout=4,allow_redirects=True)
 except:return None
 if r.status_code>=400:return None
 soup=BeautifulSoup(r.text,"html.parser")
 title=soup.title.get_text(" ",strip=True) if soup.title else ""
 text=soup.get_text(" ",strip=True)
 if any(x in text for x in INACTIVE) or any(x in title for x in NON_HOME):return None
 p=price(title)
 if not p:return None
 deal,dep,rent=p
 if dep>18000 or (deal=="월세" and rent>150):return None
 mid=re.search(r"/articles/(\d+)",r.url)
 if not mid:return None
 aid=mid.group(1)

 if "오피스텔" in title+text: typ="오피스텔"
 elif "아파트" in title+text: typ="아파트"
 elif "빌라" in title+text or "다세대" in title+text or "연립" in title+text: typ="다세대·빌라"
 elif "도시형생활주택" in title+text: typ="도시형생활주택"
 else: typ="단독·다가구"

 rooms=re.search(r"방\s*(\d+)\s*개",text)
 if "쓰리룸" in text or (rooms and int(rooms.group(1))>=3): layout="쓰리룸"
 elif "투룸" in text or (rooms and int(rooms.group(1))==2): layout="투룸"
 elif "분리형 원룸" in text or "1.5룸" in text: layout="1.5룸"
 else: layout="원룸"

 py=0
 for pat in (r"전용면적\s*[\d.]+\s*m²\s*\(([\d.]+)평\)",r"전용\s*([\d.]+)평",r"\s([\d.]+)평\s"):
  mm=re.search(pat,text+" "+title)
  if mm:
   try:py=round(float(mm.group(1)),2)
   except:pass
   break

 if province=="경기도":
  mm=re.search(re.escape(province)+r"\s+"+re.escape(city)+r"\s+([가-힣]+구)\s+([가-힣0-9]+(?:동|읍|면|가))",text)
  if mm:dong=mm.group(1)+" "+mm.group(2)
  else:
   mm=re.search(re.escape(province)+r"\s+"+re.escape(city)+r"\s+([가-힣0-9]+(?:동|읍|면|가))",text)
   dong=mm.group(1) if mm else "위치 확인 필요"
 else:
  mm=re.search(re.escape(province)+r"\s+"+re.escape(city)+r"\s+([가-힣0-9]+(?:동|읍|면|가))",text)
  dong=mm.group(1) if mm else "위치 확인 필요"

 og=soup.find("meta",attrs={"property":"og:image"})
 photo=og.get("content","").strip() if og else ""
 item={"id":aid,"province":province,"city":city,"dong":dong,"type":typ,"layout":layout,"livingMode":living_mode(title,text),"py":py,"dep":dep,"rent":rent,"time":minutes,"transfer":1,"source":"당근부동산","url":"https://realty.daangn.com/articles/"+aid,"note":"자동동기화 · 원문 확인","deal":deal,"addedAt":datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat()}
 if photo:item["photo"]=photo
 return item

def discover(province,city,deal,channel):
 url="https://realty.daangn.com/map/{}/{}/{}/{}".format(quote(province,safe=""),quote(city,safe=""),quote(deal,safe=""),quote(channel,safe=""))
 try:r=S.get(url,timeout=4)
 except:return []
 if r.status_code>=400:return []
 soup=BeautifulSoup(r.text,"html.parser")
 out=[]
 for a in soup.find_all("a",href=True):
  href=a.get("href","")
  m=re.search(r"/articles/(\d+)",href)
  if m:out.append((m.group(1),urljoin("https://realty.daangn.com",href)))
 return list(dict.fromkeys(out))

def main():
 src=TARGET.read_text(encoding="utf-8")
 m=ARRAY_RE.search(src)
 if not m:raise SystemExit("listings array not found")
 listings=json.loads(m.group(1))
 existing={str(x.get("id")) for x in listings}
 new=[]

 flat=[]
 for province,cities in AREAS.items():
  for city,minutes in cities.items():
   flat.append((province,city,minutes))

 cursor=0
 if STATUS.exists():
  try:
   prev=json.loads(STATUS.read_text(encoding="utf-8"))
   cursor=int(prev.get("cursor",0))%len(flat)
  except:
   cursor=0

 batch_size=10
 chosen=[flat[(cursor+i)%len(flat)] for i in range(min(batch_size,len(flat)))]
 pages=0; checked=0

 for province,city,minutes in chosen:
  for deal in ("전세","월세"):
   for channel in ("중개","직거래"):
    pages+=1
    for aid,url in discover(province,city,deal,channel)[:10]:
     if aid in existing:continue
     checked+=1
     item=parse_article(url,province,city,minutes)
     if item:
      existing.add(aid);new.append(item)
     if checked>=10:break
     time.sleep(0.02)
    if checked>=10:break
   if checked>=10:break
  if checked>=10:break

 merged=new+listings
 compact=json.dumps(merged,ensure_ascii=False,separators=(",",":"))
 TARGET.write_text(src[:m.start(1)]+compact+src[m.end(1):],encoding="utf-8")
 next_cursor=(cursor+batch_size)%len(flat)
 status={"synced_at":datetime.now(ZoneInfo("Asia/Seoul")).isoformat(timespec="seconds"),"cursor":next_cursor,"cities_checked":[p+" "+c for p,c,_ in chosen],"map_pages_checked":pages,"candidate_articles_checked":checked,"new_listings_added":len(new),"inventory_after_sync":len(merged),"source":"당근부동산","channels":["중개","직거래"],"deals":["전세","월세"]}
 STATUS.write_text(json.dumps(status,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 print(json.dumps(status,ensure_ascii=False))

if __name__=="__main__":main()
