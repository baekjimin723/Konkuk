/* 생활권ON v40 | Linked map/list; illustrative station anchors, never listing geocodes. */
(function(){
'use strict';
const anchor={
 '구리시':{point:[37.6027778,127.1430889],name:'구리역'},
 '남양주시':{point:[37.65230,127.31236],name:'마석역'},
 '의정부시':{point:[37.73806,127.04611],name:'의정부역'},
 '안양시 동안구':{point:[37.40200,126.97672],name:'인덕원역'}
};
const anchorByDong={
 '구리시|인창동':{point:[37.6027778,127.1430889],name:'구리역'},
 '구리시|수택동':{point:[37.5819,127.1368],name:'장자호수공원'},
 '구리시|토평동':{point:[37.5819,127.1368],name:'장자호수공원'},
 '구리시|교문동':{point:[37.6027778,127.1430889],name:'구리역'},
 '남양주시|화도읍':{point:[37.65230,127.31236],name:'마석역'},
 '남양주시|별내동':{point:[37.64222,127.127208],name:'별내역'},
 '남양주시|진접읍':{point:[37.7199,127.2032],name:'진접역'},
 '의정부시|의정부동':{point:[37.73806,127.04611],name:'의정부역'},
 '의정부시|금오동':{point:[37.73806,127.04611],name:'의정부역 (시 대표)'},
 '의정부시|용현동':{point:[37.73806,127.04611],name:'의정부역 (시 대표)'},
 '의정부시|신곡동':{point:[37.73806,127.04611],name:'의정부역 (시 대표)'},
 '안양시|동안구 관양동':{point:[37.40200,126.97672],name:'인덕원역'},
 '안양시|동안구 호계동':{point:[37.39430,126.96385],name:'평촌역 (동안구 참고)'}
};
const lineColors={'1호선':'#2761aa','2호선':'#259e62','4호선':'#238fcb','7호선':'#667c29','8호선':'#d95d99','경춘선':'#20a1a3'};
let map=null,groupLayer=null,markers=[],activeArea=null,activeListing=null,activeMarker=null,renderCount=0;
const qs=s=>document.querySelector(s);
function refFor(a,dong){return anchorByDong[a.city+'|'+dong]||anchor[a.label]||anchor[a.city]||null}
function currentRows(){return activeArea?activeArea.rows:[]}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]))}
function pinMarkup(n,chosen){return '<div class="region-pin-v40'+(chosen?' focus':'')+'">'+esc(n)+'</div>'}
function makePin(n,chosen){return L.divIcon({className:'region-pin-wrapper-v40',html:pinMarkup(n,chosen),iconSize:[44,44],iconAnchor:[22,22]})}
function groupFor(listing){return markers.find(x=>x.dong===listing.dong)||null}
function noMapFallback(area){
 const el=qs('#areaMapV40'),ref=anchor[area.label]||anchor[area.city];
 if(!el||!ref)return;
 const [lat,lng]=ref.point,box=.050,ratio=.066;
 el.innerHTML='<iframe title="'+esc(area.label)+' 지역 참고 지도" class="dual-map-fallback-v40" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.openstreetmap.org/export/embed.html?bbox='+(lng-ratio)+'%2C'+(lat-box)+'%2C'+(lng+ratio)+'%2C'+(lat+box)+'&amp;layer=mapnik&amp;marker='+lat+'%2C'+lng+'"></iframe>';
}
function renderMap(area){
 const target=qs('#areaMapV40');if(!target)return;
 if(typeof L==='undefined'){noMapFallback(area);return}
 if(!map){
  target.textContent='';
  map=L.map(target,{zoomControl:true,scrollWheelZoom:false,attributionControl:true}).setView([37.6027778,127.1430889],11);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'}).addTo(map);
 }
 if(groupLayer){groupLayer.remove();groupLayer=null}
 groupLayer=L.featureGroup().addTo(map);markers=[];
 const groups=new Map();
 area.rows.forEach(l=>{if(!groups.has(l.dong))groups.set(l.dong,[]);groups.get(l.dong).push(l)});
 for(const [dong,rows] of groups){
  const ref=refFor(area,dong);if(!ref)continue;
  const marker=L.marker(ref.point,{icon:makePin(rows.length,false),title:dong+' 참고 역·공원'}).addTo(groupLayer);
  marker.bindPopup('<b>'+esc(area.city+' '+dong)+'</b><div>'+rows.length+'건 · '+esc(ref.name)+' 참고 위치</div><small>개별 매물 주소 위치가 아닙니다.</small>');
  marker.on('click',()=>select(String(rows[0].id),true));
  markers.push({dong,rows,marker,ref});
 }
 const list=markers.map(x=>x.marker.getLatLng());
 if(list.length>1){map.fitBounds(L.latLngBounds(list).pad(.28),{maxZoom:12,animate:false})}
 else if(list.length===1){map.setView(list[0],13,{animate:false})}
 else{const ref=anchor[area.label]||anchor[area.city];if(ref)map.setView(ref.point,12,{animate:false})}
 window.requestAnimationFrame(()=>map.invalidateSize());
}
function routeUrl(l){return 'https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent([l.province,l.city,l.dong].filter(Boolean).join(' '))+'&destination='+encodeURIComponent('건대입구역')+'&travelmode=transit'}
function durationValue(label){
 const numbers=String(label).match(/\d+/g);
 return numbers?(numbers.length>1?(Number(numbers[0])+Number(numbers[1]))/2:Number(numbers[0])):0;
}
function routeExample(l){
 const exact=featuredRailExamples[l.city+'|'+l.dong];
 if(exact)return {path:exact,representative:false};
 const fallbackByCity={'구리시':'구리시|교문동','남양주시':'남양주시|화도읍','의정부시':'의정부시|금오동','안양시':'안양시|동안구 관양동'};
 const path=featuredRailExamples[fallbackByCity[l.city]];
 return {path:path||null,representative:Boolean(path)};
}
function timelineHtml(l){
 const data=routeExample(l),route=data.path,id=String(l.id);
 const header='<div class="timebox-header"><b>🚇 환승·소요시간 한눈에</b><span>전체 예상 약 '+esc(l.time)+'분</span></div>';
 const caveat='<p class="timebox-note-v40">전체 시간은 기존 건대입구역 기준 참고값이에요. 지도 출발점은 동네 대표역·공원이며 개별 매물의 위치가 아닙니다.</p>';
 const link='<a class="timebox-map-link-v40" href="'+esc(routeUrl(l))+'" target="_blank" rel="noopener noreferrer">지도에서 실제 경로 확인</a>';
 if(!route)return header+'<div class="timebox-sub">이 매물의 출발역·환승 경로가 아직 확인되지 않았어요.</div><div class="timebox-unavailable-v40">시간대별 이동·환승 구간은 지도에서 확인 필요</div>'+link+caveat;
 const secs=route.legs.map(leg=>durationValue(leg[1])),total=Math.max(1,secs.reduce((s,v)=>s+v,0));
 const segments=route.legs.map((leg,i)=>{
  const color=lineColors[leg[0]]||'#6587a4';
  return (i?'<div class="route-transfer-v40"><strong>⇄</strong><small>환승</small></div>':'')
   +'<div class="route-segment-v40" style="background:'+color+';flex:'+Math.max(1,secs[i]/total*100)+'"><b>'+esc(leg[0])+'</b><span>'+esc(leg[1])+'</span></div>';
 }).join('');
 const stations=route.stations.map((s,i)=>'<span>'+esc(s)+(i<route.stations.length-1?'<em>→</em>':'')+'</span>').join('');
 const desc=data.representative?'지역 대표역 기준 철도 탑승 구간 예시 · 이 매물의 실제 출발역이 다를 수 있어요.':'매물 소재 동 대표역 기준 철도 탑승 구간 예시';
 return header+'<div class="timebox-sub">'+desc+'</div><div class="route-segments-v40">'+segments+'</div><div class="route-stations-v40">'+stations+'</div>'
 +'<p class="timebox-note-v40">색 막대는 <b>열차 탑승시간</b>만 비례해 보여줘요. 도보·대기·환승 보행시간은 구간별 자료가 없어 막대에 포함하지 않았어요. 실시간 경로가 아니에요.</p>'+link+caveat;
}
function select(id,fromPin){
 if(!activeArea)return;
 const listing=activeArea.rows.find(l=>String(l.id)===String(id));
 if(!listing)return;
 activeListing=listing;
 const cards=Array.from(document.querySelectorAll('#discoveryListings [data-area-id-v40]'));
 cards.forEach(card=>{
  const active=card.dataset.areaIdV40===String(id);
  card.classList.toggle('active-v40',active);
  card.setAttribute('aria-selected',String(active));
 });
 const panel=qs('#routeTimelineV40');if(panel)panel.innerHTML=timelineHtml(listing);
 const group=groupFor(listing);
 for(const m of markers)m.marker.setIcon(makePin(m.rows.length,m===group));
 if(group&&map){
  map.panTo(group.ref.point,{animate:true,duration:.4});
  group.marker.openPopup();
 }
 if(fromPin){const item=cards.find(card=>card.dataset.areaIdV40===String(id));if(item)item.scrollIntoView({block:'nearest',behavior:'smooth'})}
 const title=qs('#dualMapCurrentV40');if(title)title.textContent=listing.city+' '+listing.dong+' · 동네 참고';
}
function render(area){
 if(!area||!area.rows||!area.rows.length)return;
 const request=++renderCount;activeArea=area;
 const count=qs('#dualListCountV40');if(count)count.textContent=area.rows.length+'건';
 const current=qs('#dualMapCurrentV40');if(current)current.textContent=area.label+' · 동네 참고';
 requestAnimationFrame(()=>{
  if(request!==renderCount)return;
  renderMap(area);
  const first=document.querySelector('#discoveryListings [data-area-id-v40]');
  if(first)select(first.dataset.areaIdV40,false);
 });
}
function install(){
 const el=qs('#discoveryListings');if(!el)return;
 el.addEventListener('click',e=>{
  if(e.target.closest('a, button'))return;
  const card=e.target.closest('[data-area-id-v40]');
  if(card)select(card.dataset.areaIdV40,false);
 });
 el.addEventListener('keydown',e=>{
  if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-area-id-v40]')){e.preventDefault();select(e.target.dataset.areaIdV40,false)}
 });
 window.LivingAreaMapV40={render,select};
 if(typeof rankedAreasV31!=='undefined'&&rankedAreasV31[slideIndexV31])render(rankedAreasV31[slideIndexV31]);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
