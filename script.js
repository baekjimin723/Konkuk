// 청년전세ON 웹 프로토타입
// 화면 전환, 지원한도/추가부담 계산, D-Day, 관심매물 상태 관리 등을 담당합니다.
// 데이터는 브라우저 localStorage에 저장됩니다.

const $=s=>document.querySelector(s), app=$('#app');

const titles={home:'나의 대시보드',profile:'사용자별 지원조건 자동 정리',calc:'추가부담 가능 범위 계산',check:'사용자 조건에 따른 매물 확인',saved:'관심매물 진행상태 관리',agent:'공인중개사 전세임대 실적'};

const stages=['관심매물','중개사 문의','임대인 동의 확인','권리분석 요청','보완 요청','승인','반려','계약 완료'];

const iso=d=>{const t=new Date(d);return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`};

const today=new Date();

const plus=n=>{const d=new Date(today);d.setDate(d.getDate()+n);return iso(d)};

const defaults={profile:{region:'서울특별시',people:'1',rank:'1',limit:12000,selected:plus(-17),deadline:plus(43)},price:15000,properties:[{id:1,name:'행복빌라 101호',address:'서울특별시 광진구 자양동 · 예시',price:15000,stage:'권리분석 요청'},{id:2,name:'한아름하우스 202호',address:'서울특별시 광진구 화양동 · 예시',price:11000,stage:'임대인 동의 확인'},{id:3,name:'드림아파트 305호',address:'서울특별시 광진구 구의동 · 예시',price:17000,stage:'중개사 문의'}],check:{area:49.5,type:'다세대',move:'확인 필요',rights:'확인 필요',consent:'확인 필요',address:'',selectedAddress:null}};

let state=structuredClone(defaults);try{const x=JSON.parse(localStorage.getItem('jeonse-on-v1'));if(x&&x.profile&&Array.isArray(x.properties)&&x.check){state=x;state.check.address=state.check.address||'';state.check.selectedAddress=state.check.selectedAddress||null}}catch{}let page='home',filter='전체';

let storageWarn=false;
let addressSearchTimer=0,addressSearchController=null,addressSearchSequence=0,addressSuggestions=[],addressActiveIndex=-1;
const addressSearchEndpoint=window.JEONSE_ON_CONFIG?.addressSearchEndpoint||'/api/address-search';

function save(){try{localStorage.setItem('jeonse-on-v1',JSON.stringify(state))}catch{if(!storageWarn){storageWarn=true;toast('브라우저 저장이 제한되어 이번 화면에서만 유지됩니다.')}}}

function toast(msg){$('#toast').textContent=msg;

$('#toast').classList.remove('hidden');clearTimeout(window.tt);

window.tt=setTimeout(()=>$('#toast').classList.add('hidden'),2600)}const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const money=v=>Number(v).toLocaleString('ko-KR')+'만원';

const max=()=>state.profile.limit*(state.profile.people==='1'?1.5:2);

const areaMax=()=>({'1':60,'2':70,'3':85}[state.profile.people]);

const opt=(a,s)=>a.map(v=>`<option ${String(v)===String(s)?'selected':''}>${esc(v)}</option>`).join('');

const town='<svg aria-hidden="true"><use href="#town"/></svg>';

const room='<div class="room"><svg aria-hidden="true"><use href="#room"/></svg></div>';

const header=(title,desc)=>`<div class="intro"><div><h1>${title}</h1><p>${desc}</p></div><span class="pill">나의 조건을 기준으로</span></div>`;

const official='<div class="info">입력 정보에 따른 사전 확인 결과입니다. 최종 지원·계약 가능 여부는 사업시행기관의 권리분석과 승인에 따라 결정됩니다.</div>';
const normalizeAddress=item=>({roadAddr:item.roadAddr||item.roadAddress||'',jibunAddr:item.jibunAddr||item.jibunAddress||'',zipNo:item.zipNo||'',admCd:item.admCd||'',rnMgtSn:item.rnMgtSn||'',bdMgtSn:item.bdMgtSn||'',buildingName:item.bdNm||item.buildingName||''});
const addressResults=data=>Array.isArray(data?.results)?data.results:Array.isArray(data?.juso)?data.juso:Array.isArray(data?.results?.juso)?data.results.juso:[];
const addressDropdown=()=>{const list=$('#address-suggestions');if(!list)return;list.innerHTML=addressSuggestions.length?addressSuggestions.slice(0,5).map((item,index)=>`<li><button type="button" class="${index===addressActiveIndex?'active':''}" data-address-index="${index}"><strong>${esc(item.roadAddr)}</strong><span>지번: ${esc(item.jibunAddr||'주소 정보 없음')}</span>${item.buildingName?`<small>${esc(item.buildingName)}</small>`:''}</button></li>`).join(''):'<li class="address-empty">검색된 주소가 없습니다.</li>';list.classList.remove('hidden');$('#address-input')?.setAttribute('aria-expanded','true')};
const closeAddressDropdown=()=>{$('#address-suggestions')?.classList.add('hidden');$('#address-input')?.setAttribute('aria-expanded','false');addressActiveIndex=-1};
const chooseAddress=index=>{const selected=addressSuggestions[index];if(!selected)return;state.check.selectedAddress=selected;state.check.address=selected.roadAddr;save();const input=$('#address-input');if(input)input.value=selected.roadAddr;closeAddressDropdown()};
async function searchAddresses(query){if(addressSearchController)addressSearchController.abort();const sequence=++addressSearchSequence,addressInput=$('#address-input'),list=$('#address-suggestions');if(query.length<2){addressSuggestions=[];closeAddressDropdown();return}addressSearchController=new AbortController();list?.classList.remove('hidden');list?.classList.add('loading');if(list)list.innerHTML='<li class="address-loading"><span class="spinner" aria-hidden="true"></span> 주소를 검색 중입니다.</li>';try{const response=await fetch(`${addressSearchEndpoint}?query=${encodeURIComponent(query)}`,{headers:{Accept:'application/json'},signal:addressSearchController.signal});if(!response.ok)throw new Error(`주소 검색 요청 실패 (${response.status})`);const data=await response.json();if(sequence!==addressSearchSequence||addressInput?.value.trim()!==query)return;addressSuggestions=addressResults(data).map(normalizeAddress).filter(item=>item.roadAddr).slice(0,5);addressActiveIndex=-1;list?.classList.remove('loading');addressDropdown()}catch(error){if(error.name==='AbortError')return;if(sequence!==addressSearchSequence)return;addressSuggestions=[];if(list){list.classList.remove('loading');list.innerHTML='<li class="address-empty">주소 검색에 실패했습니다. 잠시 후 다시 시도해 주세요.</li>';list.classList.remove('hidden')}}}
function render(){document.querySelectorAll('[data-page]').forEach(b=>{b.classList.toggle('active',b.dataset.page===page);if(b.dataset.page===page)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});

$('#crumb').textContent=titles[page];app.innerHTML='<section class="screen">'+views[page]()+'</section>';bind()}
const views={
home:()=>{const p=state.profile;

const dateNumber=s=>Date.parse(s+'T00:00:00Z');

const days=Math.round((dateNumber(p.deadline)-dateNumber(iso(today)))/86400000);

const total=(dateNumber(p.deadline)-dateNumber(p.selected))/86400000;

const elapsed=Math.max(0,Math.min(100,(1-days/Math.max(1,total))*100));return `<div class="hero"><div><div class="eyebrow">YOUR JEONSE JOURNEY</div><h1>내 집을 찾는 여정,<br>오늘도 함께할게요.</h1><p class="small muted">나의 지원조건과 매물 진행상황을 한눈에 확인하세요.</p></div>${town}</div><div class="intro"><h2 style="margin:0">매물 탐색 D-Day</h2><button class="btn secondary" data-page="profile">선정정보 수정 ↗</button></div><div class="deadline"><div><h3>계약기한까지</h3><strong class="dday">${days>0?'D-'+days:days===0?'D-Day':'D+'+Math.abs(days)}</strong><div class="progress"><i style="width:${elapsed}%"></i></div><div class="dates"><span>선정일 &nbsp;${p.selected}</span><span>계약기한 &nbsp;${p.deadline}</span></div></div><div><h2 style="color:#ed4d72;margin-bottom:8px">${days<0?'등록한 계약기한이 지났어요.':days<=30?'계약기한이 가까워지고 있어요.':'차근차근, 나에게 맞는 집으로.'}</h2><p class="small muted">${days<0?'담당 기관의 안내와 등록된 날짜를 확인해 주세요.':'관심매물의 임대인 동의와 권리분석 진행상황을 확인해 보세요.'}</p><button class="btn secondary" data-page="saved">나의 진행상황 확인 →</button></div></div><div class="card" style="margin-top:22px"><div class="intro"><h2 style="margin:0">현재 진행 현황</h2><button class="blue small" data-page="saved">전체 진행현황 보기 ›</button></div><div class="metrics">${[['전체 관심매물',state.properties.length],['중개사 문의',state.properties.filter(x=>x.stage==='중개사 문의').length],['권리분석 요청',state.properties.filter(x=>x.stage==='권리분석 요청').length],['계약 완료',state.properties.filter(x=>x.stage==='계약 완료').length]].map(x=>`<div class="metric">${x[0]}<strong>${x[1]}<small> 개</small></strong></div>`).join('')}</div></div><div class="quick"><button data-page="profile">▤ &nbsp; 내 지원조건<small>${p.region} · ${p.people}인 · ${money(p.limit)}</small></button><button data-page="calc">▦ &nbsp; 추가부담 계산<small>보증금과 지원한도를 비교해 보세요.</small></button><button data-page="check">⌕ &nbsp; 매물 조건 확인<small>모르는 정보도 놓치지 않도록.</small></button></div>`},
profile:()=>{const p=state.profile;return `<div class="hero"><div><div class="eyebrow">YOUR JEONSE SUPPORT</div><h1>청년의 주거, 오늘도 더 가까이</h1><p class="small muted">나의 선정정보에서 시작하는 전세임대 길잡이</p></div>${town}</div>${header('사용자별 지원조건 자동 정리','선정통보를 받은 정보를 입력하면 나의 조건을 한 화면에 정리합니다.')}<div class="grid2"><form id="profile-form" class="card"><h2>선정정보 입력</h2><label class="field"><span>신청지역</span><select name="region">${opt(['서울특별시','경기도','인천광역시','그 외 지역'],p.region)}</select></label><div class="grid2"><label class="field"><span>입주인원</span><select name="people">${[1,2,3].map(n=>`<option value="${n}" ${p.people==n?'selected':''}>${n}인</option>`).join('')}</select></label><label class="field"><span>선정순위</span><select name="rank">${[1,2,3].map(n=>`<option value="${n}" ${p.rank==n?'selected':''}>${n}순위</option>`).join('')}</select></label></div><label class="field"><span>선정통보에 명시된 지원한도 (만원)</span><input name="limit" type="number" min="1" max="10000000" step="1" required value="${p.limit}"></label><p class="small muted" id="limit-help">초기값은 자료의 수도권 1인 예시입니다. 지역·인원을 바꿀 때는 해당 선정통보의 한도를 직접 입력해 주세요.</p><div class="grid2"><label class="field"><span>선정일</span><input type="date" name="selected" value="${p.selected}" required></label><label class="field"><span>계약기한</span><input type="date" name="deadline" value="${p.deadline}" required></label></div><button class="btn full">조건 저장하기 →</button></form><div class="card conditions"><h2>▤ &nbsp; 내 전세임대 지원조건</h2><p class="small muted">저장된 정보를 기준으로 표시합니다.</p><div class="keyrow big"><span>지원한도</span><strong>${money(p.limit)}</strong></div><div class="keyrow"><span>선정정보</span><strong>${p.region} · ${p.people}인 · ${p.rank}순위</strong></div><div class="keyrow"><span>전용면적 기준</span><strong>${areaMax()}㎡ 이하</strong></div><div class="keyrow"><span>최대 전세금 범위</span><strong>${money(max())}<br><span class="small">지원한도의 ${p.people==='1'?'150':'200'}%</span></strong></div><div class="keyrow"><span>계약기한</span><strong>${p.deadline}</strong></div><div class="keyrow"><span>자료상 주택유형</span><strong>단독 · 다가구 · 다세대 · 연립<br>아파트 · 주거용 오피스텔</strong></div><div class="info">면적과 초과부담 배수는 업로드된 활동자료의 일반 기준을 적용했습니다. 개별 공고의 예외나 변경 기준은 반영되지 않습니다.</div></div></div>`},
calc:()=>`${header('추가부담 가능 범위 계산','매물의 전세보증금을 입력하고 한도 초과분과 허용범위를 확인하세요.')}<div class="grid-main"><div class="card"><h2>▦ &nbsp; 전세보증금 계산기</h2><div class="keyrow"><span>내 지원한도</span><strong>${money(state.profile.limit)}</strong></div><div class="keyrow"><span>입주인원</span><strong>${state.profile.people}인 · ${state.profile.people==='1'?'150':'200'}% 범위</strong></div><form id="calc-form" style="margin-top:22px"><label class="field"><span>매물 전세보증금</span><div class="money"><input name="price" type="number" min="1" max="10000000" step="1" required value="${state.price}"><span style="white-space:nowrap">만원</span><button class="btn" style="white-space:nowrap">계산하기</button></div></label></form><div id="calc-result" aria-live="polite">${calcResult()}</div>${official}</div><div class="side-note"><h3>계산 한 번으로<br>전세금 부담을 확인해요.</h3>${town}<h3>용어 안내</h3><p><b>최대 허용 전세금</b><br>지원한도 × 입주인원별 배수</p><p><b>한도 초과분</b><br>매물 전세금 − 지원한도<br>(한도 이내라면 0원)</p><p>기본 임대보증금, 월 임대료, 관리비 등은 별도입니다.</p></div></div>`,
check:()=>`${header('사용자 조건에 따른 매물 확인','입력한 매물 정보와 나의 조건을 비교하고 추가 확인이 필요한 항목을 살펴보세요.')}<div class="card"><div class="field address-picker"><span>주소 검색</span><div class="address-input-wrap"><input id="address-input" name="address" autocomplete="off" maxlength="120" placeholder="도로명주소 또는 지번주소를 입력하세요" value="${esc(state.check.selectedAddress?.roadAddr||state.check.address||'')}" aria-controls="address-suggestions" aria-expanded="false"><ul id="address-suggestions" class="address-suggestions hidden" role="listbox"></ul></div><p class="small muted">2글자 이상 입력하면 주소 검색이 시작됩니다.</p></div>${state.check.selectedAddress?`<div class="selected-address"><strong>선택된 주소</strong><span>${esc(state.check.selectedAddress.roadAddr)}</span><small>지번: ${esc(state.check.selectedAddress.jibunAddr||'정보 없음')} · 우편번호 ${esc(state.check.selectedAddress.zipNo||'정보 없음')}</small></div>`:''}</div><div class="card"><div class="listing-head">${room}<div><span class="pill">시연용 매물</span><h2>내가 확인 중인 매물</h2><p class="blue">전세보증금 ${money(state.price)}</p><p class="small muted">보증금은 추가부담 계산 화면과 연동됩니다.<br>확인하지 않은 항목은 ‘확인 필요’로 남겨두세요.</p><button class="btn secondary" data-page="calc">보증금 수정</button></div></div><h2>내 조건과 비교</h2><div class="table-wrap"><table><thead><tr><th>항목</th><th>내 조건</th><th>매물 정보 입력</th><th>결과</th></tr></thead><tbody><tr><td>전세보증금</td><td>최대 ${money(max())}</td><td>${money(state.price)}</td><td>${badge(state.price>max()?'미충족':state.price>state.profile.limit?'추가부담':'충족')}</td></tr><tr><td>전용면적</td><td>${areaMax()}㎡ 이하</td><td><input aria-label="전용면적 제곱미터" id="check-area" type="number" min="0.1" max="10000" step="0.1" value="${state.check.area}"></td><td id="area-status"></td></tr><tr><td>주택유형</td><td>자료상 지원 주택</td><td><select aria-label="주택유형" data-check="type">${opt(['단독','다가구','다세대','연립','아파트','주거용 오피스텔','근린생활시설','확인 필요'],state.check.type)}</select></td><td id="type-status"></td></tr>${[['move','전입신고','가능해야 함'],['rights','제한권리','등기사항 확인 필요'],['consent','임대인 동의','LH 계약방식 동의']].map(([k,n,c])=>`<tr><td>${n}</td><td>${c}</td><td><select aria-label="${n}" data-check="${k}">${opt(k==='rights'?['확인 필요','제한권리 없음','제한권리 있음']:['확인 필요','예','아니오'],state.check[k])}</select></td><td id="${k}-status"></td></tr>`).join('')}</tbody></table></div><div id="check-result" aria-live="polite"></div>${official}</div>`,
saved:()=>`${header('나의 매물','관심매물부터 계약 완료까지, 여러 매물의 진행상태를 직접 관리하세요.')}<div class="intro"><p class="small muted">상태는 사용자 기록이며 기관의 공식 심사 조회 결과가 아닙니다.</p><button class="btn" id="add-property">＋ 매물 등록</button></div><div class="tabs" aria-label="매물 필터">${['전체','진행 중','완료','반려'].map(x=>`<button class="${filter===x?'active':''}" data-filter="${x}">${x}</button>`).join('')}</div>${state.properties.filter(x=>filter==='전체'||filter==='완료'&&x.stage==='계약 완료'||filter==='반려'&&x.stage==='반려'||filter==='진행 중'&&!['계약 완료','반려'].includes(x.stage)).map(x=>`<article class="saved-row">${room}<div><h3>${esc(x.name)}</h3><strong class="blue small">전세 ${money(x.price)}</strong><p class="small muted">${esc(x.address)}</p><span class="pill ${x.stage==='계약 완료'?'green':x.stage==='반려'?'orange':''}">${x.stage}</span><div class="track" aria-hidden="true">${Array.from({length:6},(_,i)=>`<span class="${i<=({'관심매물':0,'중개사 문의':1,'임대인 동의 확인':2,'권리분석 요청':3,'보완 요청':3,'승인':4,'반려':3,'계약 완료':5}[x.stage])?'done':''}"></span>`).join('')}</div></div><div class="saved-actions"><select aria-label="${esc(x.name)} 진행상태" data-stage="${x.id}">${opt(stages,x.stage)}</select><button class="btn secondary" data-load="${x.id}">이 매물 조건 확인 →</button><button class="small muted" data-delete="${x.id}">목록에서 삭제</button></div></article>`).join('')||'<div class="card empty">해당 상태의 매물이 없습니다.</div>'}`,
agent:()=>`${header('공인중개사 전세임대 실적','전세임대 관련 활동 이력을 함께 살펴보는 화면입니다.')}<div class="card"><div class="agent-banner"><div class="agent-avatar"><svg class="blue"><use href="#brand"/></svg></div><div><span class="pill orange">가상 중개사 · 시연 데이터</span><h2 style="font-size:23px;margin:9px 0">행복부동산 공인중개사사무소</h2><p class="small muted">서울특별시 광진구 · 예시 중개업소</p><p class="small">“청년의 첫 전세임대 계약을 차근차근 함께합니다.”</p></div></div><div class="tabs"><button class="active">전세임대 실적</button></div><h2>숫자로 살펴보는 전세임대 경험</h2><p class="small muted">아래 수치는 문서 예시 화면을 재현한 가상 누적 건수입니다.</p><div class="agent-metrics">${[['전세임대 매물 등록',32],['사전조건 확인',25],['권리분석 진행',18],['권리분석 승인',15],['실제 계약 성사',12]].map(x=>`<div class="metric">${x[0]}<strong>${x[1]}<small> 건</small></strong></div>`).join('')}</div><div class="info">각 지표는 서로 다른 단계의 누적 기록입니다. 같은 기간·대상 집단의 데이터가 확보되기 전에는 승인율이나 계약성사율로 해석하지 않습니다.</div><div style="margin-top:25px"><h3>실적을 확인할 때 함께 볼 정보</h3><div class="keyrow"><span>집계기간</span><strong>미연동 · 예시 데이터</strong></div><div class="keyrow"><span>증빙자료</span><strong>실제 계약·승인 기록 연동 예정</strong></div><div class="keyrow"><span>우수 협력 중개사 여부</span><strong>실적 검증 후 별도 판단</strong></div></div></div>`
};
function badge(v){return `<span class="pill ${v==='충족'?'green':v==='미충족'||v==='추가부담'||v==='확인 필요'?'orange':''}">${v}</span>`}
function calcResult(){const extra=Math.max(0,state.price-state.profile.limit),bad=state.price>max();return `<div class="summary"><h3 class="blue">계산 결과</h3><div class="keyrow"><span>최대 허용 전세금</span><strong>${money(max())}</strong></div><div class="keyrow"><span>매물 전세보증금</span><strong>${money(state.price)}</strong></div><div class="keyrow big"><span>지원한도 초과분</span><strong style="color:${extra?'#ed4f67':'#1a64ef'}">${money(extra)}</strong></div></div><div class="result ${bad?'bad':''}"><strong>${bad?'전세금 허용범위를 초과합니다.':extra?'추가부담 허용범위 이내입니다.':'지원한도 이내입니다.'}</strong><p>${bad?'허용범위보다 '+money(state.price-max())+' 높습니다. 전세금 조정 또는 다른 매물을 검토하세요.':extra?'한도 초과분의 본인 부담 가능 여부와 나머지 매물 조건을 확인하세요.':'면적·권리관계·임대인 동의 등 나머지 조건도 확인해 주세요.'}</p></div><p class="small muted" style="margin-top:12px">위 금액은 지원한도 초과분만 계산합니다. 기본 임대보증금과 기타 비용을 합한 총 자기부담금은 아닙니다.</p>`}
function checkResult(){const c=state.check,ar=Number(c.area);

const vals={area:!Number.isFinite(ar)||ar<=0?'확인 필요':ar>areaMax()?'미충족':'충족',type:c.type==='근린생활시설'?'미충족':['확인 필요','주거용 오피스텔'].includes(c.type)?'확인 필요':'충족',move:c.move==='예'?'충족':c.move==='아니오'?'미충족':'확인 필요',rights:c.rights==='제한권리 없음'?'충족':c.rights==='제한권리 있음'?'미충족':'확인 필요',consent:c.consent==='예'?'충족':c.consent==='아니오'?'미충족':'확인 필요'};Object.entries(vals).forEach(([k,v])=>$('#'+k+'-status').innerHTML=badge(v));

const fail=state.price>max()||Object.values(vals).includes('미충족');

$('#check-result').innerHTML=`<div class="result ${fail?'bad':'warn'}"><strong>${fail?'현재 입력 기준 미충족 항목이 있습니다.':'확인 필요 · 공식 권리분석 전 단계입니다.'}</strong><p>${fail?'표에 표시된 미충족 항목을 확인하고 조건 조정 또는 보완 가능 여부를 문의하세요.':'확인되지 않은 항목을 먼저 확인해 주세요.'} 주택가격·선순위 보증금·소유관계·임대인 제한사항은 이 화면에서 검증하지 않으므로 계약 가능 여부를 확정하지 않습니다.${c.type==='주거용 오피스텔'?' 오피스텔은 난방·취사·화장실 등 주거용 시설 확인도 필요합니다.':''}</p></div>`}
function go(p){if(!titles[p])return;page=p;history.replaceState(null,'','#'+p);render();

window.scrollTo({top:0,behavior:'instant'})}
document.addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b)go(b.dataset.page)});
function bind(){if(page==='profile'){const f=$('#profile-form');['region','people'].forEach(n=>f.elements[n].addEventListener('change',()=>{f.elements.limit.value='';

$('#limit-help').textContent='변경한 지역·입주인원에 해당하는 선정통보의 지원한도를 입력해 주세요.'}));f.onsubmit=e=>{e.preventDefault();

const d=Object.fromEntries(new FormData(f));if(d.deadline<d.selected){toast('계약기한은 선정일 이후로 입력해 주세요.');return}d.limit=Number(d.limit);state.profile=d;save();render();toast('지원조건을 저장했습니다.')}}if(page==='calc')$('#calc-form').onsubmit=e=>{e.preventDefault();state.price=Number(new FormData(e.target).get('price'));save();

$('#calc-result').innerHTML=calcResult()};if(page==='check'){const addressInput=$('#address-input');addressInput.oninput=()=>{const query=addressInput.value.trim();state.check.address=query;if(state.check.selectedAddress?.roadAddr!==query)state.check.selectedAddress=null;clearTimeout(addressSearchTimer);addressSearchTimer=setTimeout(()=>searchAddresses(query),300)};addressInput.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!addressSuggestions.length)return;addressActiveIndex=(addressActiveIndex+(e.key==='ArrowDown'?1:-1)+addressSuggestions.length)%addressSuggestions.length;addressDropdown()}else if(e.key==='Enter'&&addressActiveIndex>=0){e.preventDefault();chooseAddress(addressActiveIndex)}else if(e.key==='Escape'){closeAddressDropdown();addressInput.setAttribute('aria-expanded','false')}};$('#address-suggestions').onclick=e=>{const option=e.target.closest('[data-address-index]');if(option)chooseAddress(Number(option.dataset.addressIndex))};addressInput.onfocus=()=>{if(addressSuggestions.length)addressDropdown()};document.addEventListener('click',e=>{if(!e.target.closest('.address-picker'))closeAddressDropdown()},{once:true});checkResult();

$('#check-area').oninput=e=>{state.check.area=e.target.value;save();checkResult()};

document.querySelectorAll('[data-check]').forEach(el=>el.onchange=()=>{state.check[el.dataset.check]=el.value;save();checkResult()})}if(page==='saved'){$('#add-property').onclick=()=>$('#modal').showModal();

document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;render()});

document.querySelectorAll('[data-stage]').forEach(el=>el.onchange=()=>{state.properties.find(x=>String(x.id)===el.dataset.stage).stage=el.value;save();render();toast('진행상태를 저장했습니다.')});

document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{if(confirm('이 관심매물을 목록에서 삭제할까요?')){state.properties=state.properties.filter(x=>String(x.id)!==b.dataset.delete);save();render()}});

document.querySelectorAll('[data-load]').forEach(b=>b.onclick=()=>{const x=state.properties.find(x=>String(x.id)===b.dataset.load);state.price=x.price;state.check={area:'',type:'확인 필요',move:'확인 필요',rights:'확인 필요',consent:'확인 필요'};save();go('check');toast(x.name+'의 보증금을 불러왔습니다. 나머지 조건을 입력해 주세요.')})}}
$('#close-modal').onclick=()=>$('#modal').close();

$('#add-form').onsubmit=e=>{e.preventDefault();

const d=Object.fromEntries(new FormData(e.target));if(!d.name.trim()||!d.address.trim()){toast('매물 이름과 주소를 입력해 주세요.');return}state.properties.push({id:Date.now(),name:d.name.trim(),address:d.address.trim(),price:Number(d.price),stage:'관심매물'});save();

$('#modal').close();e.target.reset();filter='전체';render();toast('관심매물을 등록했습니다.')};

window.addEventListener('hashchange',()=>{const p=location.hash.slice(1);if(titles[p]){page=p;render()}});page=titles[location.hash.slice(1)]?location.hash.slice(1):'home';render();
