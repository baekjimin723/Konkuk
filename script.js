// 청년전세ON 웹 프로토타입
// 화면 전환, 지원한도/추가부담 계산, D-Day, 관심매물 상태 관리 등을 담당합니다.
// 데이터는 브라우저 localStorage에 저장됩니다.

const $=s=>document.querySelector(s), app=$('#app');

const titles={home:'나의 대시보드',service:'서비스 소개',profile:'사용자별 지원조건 자동 정리',calc:'추가부담 가능 범위 계산',check:'사용자 조건에 따른 매물 확인',saved:'관심매물 진행상태 관리',agent:'공인중개사 전세임대 실적'};

const stages=['관심매물','중개사 문의','임대인 동의 확인','권리분석 요청','보완 요청','승인','반려','계약 완료'];

const iso=d=>{const t=new Date(d);return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`};

const today=new Date();

const plus=n=>{const d=new Date(today);d.setDate(d.getDate()+n);return iso(d)};

const defaults={profile:{region:'서울특별시',people:'1',limit:12000,selected:plus(-17),deadline:plus(43)},simulation:{firstRank:'unknown',familyIncome100:'unknown',selfIncome100:'unknown',self:{deposit:0,stock:0,car:0,rentalDeposit:0,realEstate:0,debt:0},parents:{deposit:0,stock:0,car:0,rentalDeposit:0,realEstate:0,debt:0}},search:{region:'서울특별시',type:'전체',maxPrice:''},selectedProperty:null,price:15000,properties:[{id:1,name:'행복빌라 101호',address:'서울특별시 광진구 자양동 · 예시',price:15000,stage:'권리분석 요청'},{id:2,name:'한아름하우스 202호',address:'서울특별시 광진구 화양동 · 예시',price:11000,stage:'임대인 동의 확인'},{id:3,name:'드림아파트 305호',address:'서울특별시 광진구 구의동 · 예시',price:17000,stage:'중개사 문의'}],check:{area:49.5,type:'다세대',move:'확인 필요',rights:'확인 필요',consent:'확인 필요'}};

let state=structuredClone(defaults);try{const x=JSON.parse(localStorage.getItem('jeonse-on-v1'));if(x&&x.profile&&Array.isArray(x.properties)&&x.check)state=x}catch{}state.profile={...defaults.profile,...state.profile};state.simulation={...structuredClone(defaults.simulation),...(state.simulation||{}),self:{...defaults.simulation.self,...((state.simulation||{}).self||{})},parents:{...defaults.simulation.parents,...((state.simulation||{}).parents||{})}};state.search={...defaults.search,...(state.search||{})};if(!('selectedProperty' in state))state.selectedProperty=null;let page='home',filter='전체';

let storageWarn=false;

function save(){try{localStorage.setItem('jeonse-on-v1',JSON.stringify(state))}catch{if(!storageWarn){storageWarn=true;toast('브라우저 저장이 제한되어 이번 화면에서만 유지됩니다.')}}}

function toast(msg){$('#toast').textContent=msg;

$('#toast').classList.remove('hidden');clearTimeout(window.tt);

window.tt=setTimeout(()=>$('#toast').classList.add('hidden'),2600)}const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const money=v=>Number(v).toLocaleString('ko-KR')+'만원';

const max=()=>state.profile.limit*(state.profile.people==='1'?1.5:2);

const areaMax=()=>85;

const opt=(a,s)=>a.map(v=>`<option ${String(v)===String(s)?'selected':''}>${esc(v)}</option>`).join('');

const town='<svg aria-hidden="true"><use href="#town"/></svg>';

const room='<div class="room"><svg aria-hidden="true"><use href="#room"/></svg></div>';

const header=(title,desc)=>`<div class="intro"><div><h1>${title}</h1><p>${desc}</p></div><span class="pill">나의 조건을 기준으로</span></div>`;

const official='<div class="info">입력 정보에 따른 사전 확인 결과입니다. 최종 지원·계약 가능 여부는 사업시행기관의 권리분석과 승인에 따라 결정됩니다.</div>';
const listingInventory=[
  {id:'L1',name:'라온빌라 201호',address:'서울특별시 광진구 자양동',region:'서울특별시',type:'다세대',price:11500,area:42.8,move:'예',rights:'제한권리 없음',consent:'예'},
  {id:'L2',name:'청년하우스 302호',address:'서울특별시 광진구 화양동',region:'서울특별시',type:'다가구',price:12800,area:38.4,move:'예',rights:'확인 필요',consent:'예'},
  {id:'L3',name:'한강아파트 507호',address:'서울특별시 성동구 성수동',region:'서울특별시',type:'아파트',price:16500,area:51.2,move:'예',rights:'제한권리 없음',consent:'확인 필요'},
  {id:'L4',name:'마루오피스텔 804호',address:'서울특별시 동대문구 장안동',region:'서울특별시',type:'주거용 오피스텔',price:10800,area:31.6,move:'예',rights:'제한권리 없음',consent:'예'},
  {id:'L5',name:'늘봄빌라 101호',address:'경기도 안양시 동안구',region:'경기도',type:'다세대',price:9800,area:44.1,move:'예',rights:'확인 필요',consent:'예'},
  {id:'L6',name:'푸른연립 203호',address:'인천광역시 남동구',region:'인천광역시',type:'연립',price:9200,area:48.9,move:'예',rights:'제한권리 없음',consent:'예'}
];
function filteredListings(){
  const s=state.search||defaults.search;
  return listingInventory.filter(x=>(!s.region||s.region==='전체'||x.region===s.region)&&(s.type==='전체'||x.type===s.type)&&(!assetNum(s.maxPrice)||x.price<=assetNum(s.maxPrice)));
}
function selectProperty(x){
  state.selectedProperty={id:x.id||null,name:x.name,address:x.address,price:Number(x.price)||0,area:x.area||'',type:x.type||'확인 필요',move:x.move||'확인 필요',rights:x.rights||'확인 필요',consent:x.consent||'확인 필요'};
  state.price=state.selectedProperty.price;
  state.check={area:state.selectedProperty.area,type:state.selectedProperty.type,move:state.selectedProperty.move,rights:state.selectedProperty.rights,consent:state.selectedProperty.consent};
  save();
}
const assetNum=v=>Math.max(0,Number(v)||0);
function assetTotal(a){return Math.max(0,assetNum(a.deposit)+assetNum(a.stock)+assetNum(a.car)+assetNum(a.rentalDeposit)+assetNum(a.realEstate)-assetNum(a.debt))}
function simulationResult(){
  const s=state.simulation,self=assetTotal(s.self),parents=assetTotal(s.parents),family=self+parents;
  const maxCar=Math.max(assetNum(s.self.car),assetNum(s.parents.car));
  const secondAsset=family<=34500&&maxCar<=4542;
  const thirdAsset=self<=25100&&assetNum(s.self.car)<=4542;
  let rank='추가 확인 필요',tone='warn',reason='소득·자산 항목을 모두 확인하면 예상 순위를 안내합니다.';
  if(s.firstRank==='yes'){rank='예상 1순위';tone='good';reason='수급자·지원대상 한부모가족·차상위계층 등 1순위 요건에 해당한다고 입력했습니다.'}
  else if(s.familyIncome100==='yes'&&secondAsset){rank='예상 2순위';tone='good';reason='본인+부모 소득 100% 이하 및 2순위 자산기준을 충족하는 것으로 계산됐습니다.'}
  else if(s.selfIncome100==='yes'&&thirdAsset){rank='예상 3순위';tone='good';reason='본인 소득 100% 이하 및 3순위 자산기준을 충족하는 것으로 계산됐습니다.'}
  else if(s.firstRank==='no'&&s.familyIncome100==='no'&&s.selfIncome100==='no'){rank='현재 입력으로는 순위 산정 어려움';tone='bad';reason='입력한 소득 조건으로는 2·3순위 요건 충족이 확인되지 않습니다.'}
  else if((s.familyIncome100==='yes'&&!secondAsset)||(s.selfIncome100==='yes'&&!thirdAsset)){rank='자산기준 확인 필요';tone='bad';reason='입력한 자산 또는 자동차 가액이 해당 순위의 기준을 넘는 항목이 있습니다.'}
  return {rank,tone,reason,self,parents,family,maxCar,secondAsset,thirdAsset};
}
function simSelect(name,value){
  return `<select name="${name}"><option value="unknown" ${value==='unknown'?'selected':''}>확인 필요</option><option value="yes" ${value==='yes'?'selected':''}>예</option><option value="no" ${value==='no'?'selected':''}>아니오</option></select>`;
}
function simAssetFields(prefix,a){
  const items=[['deposit','예금'],['stock','주식·펀드'],['car','자동차'],['rentalDeposit','임차보증금'],['realEstate','부동산'],['debt','부채']];
  return items.map(([k,label])=>`<label class="asset-field"><span>${label}</span><div><input name="${prefix}_${k}" type="number" min="0" step="1" value="${assetNum(a[k])}"><em>만원</em></div></label>`).join('');
}
function simulationResultHtml(){
  const r=simulationResult();
  return `<div class="simulation-result ${r.tone}">
    <div class="sim-rank-label">모의계산 결과</div>
    <strong>${r.rank}</strong>
    <p>${r.reason}</p>
    <div class="sim-totals"><span>본인 총자산 <b>${money(r.self)}</b></span><span>부모 총자산 <b>${money(r.parents)}</b></span><span>본인+부모 <b>${money(r.family)}</b></span></div>
    <div class="sim-criteria"><span class="${r.secondAsset?'pass':'fail'}">2순위 자산기준 · 총자산 34,500만원 / 자동차 4,542만원 이하</span><span class="${r.thirdAsset?'pass':'fail'}">3순위 자산기준 · 본인 총자산 25,100만원 / 자동차 4,542만원 이하</span></div>
  </div>`;
}

function render(){document.body.classList.toggle('home-mode',page==='home');document.body.classList.toggle('service-mode',page==='service');document.querySelectorAll('[data-page]').forEach(b=>{b.classList.toggle('active',b.dataset.page===page);if(b.dataset.page===page)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});

$('#crumb').textContent=titles[page];app.innerHTML='<section class="screen">'+views[page]()+'</section>';bind()}
const views={
home:()=>{const p=state.profile;
const dateNumber=s=>Date.parse(s+'T00:00:00Z');
const days=Math.round((dateNumber(p.deadline)-dateNumber(iso(today)))/86400000);
const total=(dateNumber(p.deadline)-dateNumber(p.selected))/86400000;
const elapsed=Math.max(0,Math.min(100,(1-days/Math.max(1,total))*100));
const dday=days>0?'D-'+days:days===0?'D-Day':'D+'+Math.abs(days);
const recent=state.properties.slice(0,3);
const activeCount=state.properties.filter(x=>!['계약 완료','반려'].includes(x.stage)).length;
const analysisCount=state.properties.filter(x=>x.stage==='권리분석 요청').length;
const completeCount=state.properties.filter(x=>x.stage==='계약 완료').length;
return `<div class='home-shell'>
<section class='home-hero home-hero-text-only'>
<div class='home-hero-copy'><span class='home-badge'>청년전세ON</span><h1>조건 확인부터<br>계약 준비까지, <em>한곳에서</em></h1><p>청년전세임대 준비 과정을 더 쉽게 정리해주는 길잡이</p><div class='home-actions'><button class='home-primary' data-page='profile'>나의 조건부터 시작하기 <span>→</span></button><button class='home-secondary' data-page='check'>매물 확인 <span>→</span></button></div></div>
</section>
<section class='home-shortcuts'>
<button data-page='profile'><i class='shortcut-icon shortcut-blue'>▤</i><span><strong>나의 조건</strong><small>지원 가능 여부 확인</small></span><b>›</b></button>
<button data-page='check'><i class='shortcut-icon shortcut-green'>⌂</i><span><strong>매물 확인</strong><small>조건에 맞는 매물 살펴보기</small></span><b>›</b></button>
<button data-page='agent'><i class='shortcut-icon shortcut-orange'>♧</i><span><strong>중개사 찾기</strong><small>전세임대 경험 확인</small></span><b>›</b></button>
<button data-page='saved'><i class='shortcut-icon shortcut-purple'>♡</i><span><strong>나의 매물</strong><small>관심 매물 모아보기</small></span><b>›</b></button>
</section>
<section class='home-dashboard'>
<article class='home-dday-card'>
<div class='home-card-head'><div><h2>매물 탐색 D-DAY</h2><p>계약기한을 기준으로 남은 시간을 확인하세요.</p></div><button class='home-text-btn' data-page='profile'>일정 관리 →</button></div>
<div class='home-dday-center'><strong>${dday}</strong><span>${days<0?'등록한 계약기한이 지났어요.':days<=30?'계약기한이 가까워지고 있어요.':'지금부터 차근차근 준비하면 충분해요!'}</span><div class='home-progress'><i style='width:${elapsed}%'></i></div><small>선정일 ${p.selected} · 계약기한 ${p.deadline}</small></div>
<div class='home-stats'><button data-page='check'><span>오늘 볼 매물</span><strong>${Math.min(3,state.properties.length)}건</strong></button><button data-page='saved'><span>관심 매물</span><strong>${state.properties.length}건</strong></button><button data-page='saved'><span>진행 중</span><strong>${activeCount}건</strong></button></div>
</article>
<div class='home-side-stack'>
<article class='home-panel'><div class='home-card-head compact'><h2>최근 본 매물</h2><button class='home-text-btn' data-page='saved'>전체보기 →</button></div><div class='home-recent'>${recent.map(x=>`<button data-load='${x.id}' data-page='check'>${room}<span><small>${esc(x.address.split('·')[0].trim())}</small><strong>${esc(x.name)}</strong><em>전세 ${money(x.price)}</em></span></button>`).join('')||'<p class="home-empty">등록한 매물이 아직 없어요.</p>'}</div></article>
<article class='home-panel'><div class='home-card-head compact'><h2>나의 준비 체크리스트</h2><button class='home-text-btn' data-page='profile'>전체보기 →</button></div><ul class='home-checklist'><li class='done'>지원 자격 확인하기</li><li class='done'>선정정보와 계약기한 확인하기</li><li class='${analysisCount?'done':''}'>권리분석 진행 확인하기</li><li class='${completeCount?'done':''}'>계약 완료까지 진행 관리하기</li></ul></article>
</div>
</section>
</div>`},
service:()=>`<div class="service-story-page">
  <section class="story-section story-one">
    <div class="story-copy">
      <div class="story-index"><span>01</span><i></i></div>
      <h1>선정됐는데도,<br><em>35%</em>는 입주하지 못합니다.</h1>
      <p>청년 전세임대주택 제도는<br>주거 부담을 줄여주기 위한 좋은 정책이지만,</p>
      <p>지원 자격을 얻고도 절반에 가까운 청년<br>(2024년 청년 실입주율 65%)이 실제 입주로<br>이어지지 못하고 있습니다.</p>
    </div>
    <div class="occupancy-ring" aria-label="2024년 청년 실입주율 65%">
      <div class="occupancy-ring-inner">
        <span>실입주율</span>
        <strong>65<small>%</small></strong>
        <b>2024년</b>
      </div>
    </div>
  </section>

  <section class="story-section story-two">
    <div class="story-copy">
      <div class="story-index"><span>02</span><i></i></div>
      <h2>집을 찾았다고<br><em>끝이 아닙니다.</em></h2>
      <p>9개월의 주택물색기간 동안<br>적합한 매물을 찾고, 임대인 동의, 권리분석,<br>내부 심사까지...</p>
      <p>주택 물색과 계약 준비 과정에서<br>실제 입주로 이어지지 못하는 사례가 발생합니다.</p>
    </div>
    <div class="story-person-visual" aria-hidden="true">
      <div class="room-glow"></div>
      <div class="bed-shape"></div>
      <div class="person-shoulder"></div>
      <div class="person-neck"></div>
      <div class="person-head"></div>
      <div class="person-bun"></div>
      <div class="person-hair"></div>
      <div class="person-arm"></div>
    </div>
  </section>

  <section class="story-quote">
    <div class="story-index"><span>03</span><i></i></div>
    <div class="quote-wrap">
      <span class="quote-mark">“</span>
      <p><strong>선정자 <em>3명 중 1명 이상</em>은</strong><br>선정 이후에도 실제 입주로<br><em>이어지지 못합니다.</em></p>
      <span class="quote-mark close">”</span>
    </div>
  </section>

  <section class="story-section story-four">
    <div class="story-copy">
      <div class="story-index"><span>04</span><i></i></div>
      <h2>그래서 우리는,<br><em>계약하기 전에</em><br>미리 알 수 있게 만들었습니다.</h2>
      <p>기존 시장 정보와 제도 정보를 연결하여,<br>청년전세임대에 필요한 판단 요소를<br>미리 확인할 수 있도록 돕습니다.</p>
      <p>실입주를 가로막는 정보 공백을 줄이는 것,<br>그것이 우리의 시작입니다.</p>
    </div>

    <div class="service-phone" aria-label="청년전세ON 매물 확인 예시">
      <div class="service-phone-speaker"></div>
      <div class="service-phone-card">
        <div class="phone-room"><svg><use href="#room"></use></svg><span>♡</span></div>
        <strong>○○ 빌라</strong>
        <small>보증금 8,000만원</small>
      </div>
      <div class="phone-status success">✓ <span>사전 확인 결과 · 주요 조건 충족 예상</span></div>
      <ul class="phone-checklist">
        <li><b>✓</b> 지역 요건 충족</li>
        <li><b>✓</b> 임대인 동의 가능성 높음</li>
        <li><b>✓</b> 권리관계 추가 확인 필요</li>
        <li><b>✓</b> 최종 심사는 LH 확인 필요</li>
      </ul>
    </div>
  </section>
</div>`,
profile:()=>{const p=state.profile,s=state.simulation,r=simulationResult();return `
<div class="condition-page compact-page">
  <div class="condition-heading compact-heading">
    <span class="eyebrow">MY ELIGIBILITY</span>
    <h1>신청 전에, 내 조건부터 확인하세요.</h1>
    <p>필요한 기능만 선택해 열어볼 수 있도록 간단하게 정리했습니다.</p>
  </div>

  <div class="page-summary-grid">
    <div class="summary-tile"><span>예상 순위</span><strong>${r.rank}</strong><small>모의계산 기준</small></div>
    <div class="summary-tile"><span>지원한도</span><strong>${money(p.limit)}</strong><small>${p.region} · ${p.people==='1'?'1인 단독거주':p.people+'인 셰어형'}</small></div>
    <div class="summary-tile"><span>계약기한</span><strong>${p.deadline}</strong><small>선정일 ${p.selected}</small></div>
  </div>

  <details class="feature-disclosure">
    <summary>
      <div><span class="section-no">01</span><span><strong>예상 자격·순위 모의계산</strong><small>자산·소득을 입력해 신청 전 예상 순위를 확인합니다.</small></span></div>
      <b>열기</b>
    </summary>
    <form id="simulation-form" class="disclosure-body simulation-card">
      <div class="section-head"><div><h2>모의계산 입력</h2></div><p>금액은 모두 만원 단위입니다.</p></div>
      <div class="sim-qualifiers">
        <label class="field"><span>수급자·보호대상 한부모가족·차상위계층·자립준비청년 등 1순위 요건에 해당하나요?</span>${simSelect('firstRank',s.firstRank)}</label>
        <label class="field"><span>본인과 부모의 월평균 소득 합계가 해당 가구 100% 기준 이하인가요?</span>${simSelect('familyIncome100',s.familyIncome100)}</label>
        <label class="field"><span>본인의 월평균 소득이 1인 가구 100% 기준 이하인가요?</span>${simSelect('selfIncome100',s.selfIncome100)}</label>
      </div>
      <div class="asset-groups">
        <section class="asset-group"><div class="asset-title"><h3>본인 자산</h3><span>3순위 판단 기준</span></div><div class="asset-grid">${simAssetFields('self',s.self)}</div></section>
        <section class="asset-group"><div class="asset-title"><h3>부모 자산</h3><span>2순위 판단 시 합산</span></div><div class="asset-grid">${simAssetFields('parents',s.parents)}</div></section>
      </div>
      <button class="btn sim-calc-btn" type="submit">예상 결과 계산하기</button>
      <div id="simulation-result">${simulationResultHtml()}</div>
      <div class="info simulation-note">본 기능은 신청 전 확인용 모의계산입니다. 실제 자산은 사회보장정보시스템의 자산가액·인정 부채 등 공식 산정방식으로 조사되므로 단순 입력 합계와 다를 수 있으며, 최종 순위는 해당 공고와 LH 심사 결과를 확인해야 합니다.</div>
    </form>
  </details>

  <details class="feature-disclosure">
    <summary>
      <div><span class="section-no">02</span><span><strong>선정 후 지원정보</strong><small>지역·거주 형태·지원한도·계약기한을 확인하거나 수정합니다.</small></span></div>
      <b>열기</b>
    </summary>
    <form id="profile-form" class="disclosure-body">
      <label class="field"><span>신청지역</span><select name="region">${opt(['서울특별시','경기도','인천광역시','그 외 지역'],p.region)}</select></label>
      <label class="field"><span>거주 형태</span><select name="people"><option value="1" ${p.people==1?'selected':''}>1인 단독거주</option><option value="2" ${p.people==2?'selected':''}>2인 공동거주(셰어형)</option><option value="3" ${p.people==3?'selected':''}>3인 공동거주(셰어형)</option></select></label>
      <label class="field"><span>선정통보에 명시된 지원한도 (만원)</span><input name="limit" type="number" min="1" max="10000000" step="1" required value="${p.limit}"></label>
      <p class="small muted" id="limit-help">실제 선정통보의 지원한도를 입력해 주세요.</p>
      <div class="grid2"><label class="field"><span>선정일</span><input type="date" name="selected" value="${p.selected}" required></label><label class="field"><span>계약기한</span><input type="date" name="deadline" value="${p.deadline}" required></label></div>
      <button class="btn full">지원정보 저장하기 →</button>
    </form>
  </details>

  <details class="feature-disclosure">
    <summary>
      <div><span class="section-no">03</span><span><strong>내 전세임대 조건 자세히 보기</strong><small>면적·최대 전세금·계약기한을 한 번에 확인합니다.</small></span></div>
      <b>열기</b>
    </summary>
    <div class="disclosure-body conditions">
      <div class="keyrow big"><span>예상 순위</span><strong>${r.rank}</strong></div>
      <div class="keyrow big"><span>지원한도</span><strong>${money(p.limit)}</strong></div>
      <div class="keyrow"><span>기본정보</span><strong>${p.region} · ${p.people}인</strong></div>
      <div class="keyrow"><span>전용면적 기준</span><strong>${areaMax()}㎡ 이하</strong></div>
      <div class="keyrow"><span>최대 전세금 범위</span><strong>${money(max())}</strong></div>
      <div class="keyrow"><span>계약기한</span><strong>${p.deadline}</strong></div>
    </div>
  </details>
</div>`},
calc:()=>`${header('추가부담 가능 범위 계산','필요할 때 계산기를 열어 전세금 부담을 확인하세요.')}
<div class="page-summary-grid two">
  <div class="summary-tile"><span>내 지원한도</span><strong>${money(state.profile.limit)}</strong><small>${state.profile.people==='1'?'1인 단독거주':state.profile.people+'인 셰어형'} 기준</small></div>
  <div class="summary-tile"><span>현재 입력 전세금</span><strong>${money(state.price)}</strong><small>계산기와 매물확인에 연동</small></div>
</div>
<details class="feature-disclosure">
  <summary><div><span class="section-no">01</span><span><strong>전세보증금 계산기</strong><small>매물 전세보증금을 입력해 추가 부담과 허용범위를 계산합니다.</small></span></div><b>계산하기</b></summary>
  <div class="disclosure-body">
    <form id="calc-form"><label class="field"><span>매물 전세보증금</span><div class="money"><input name="price" type="number" min="1" max="10000000" step="1" required value="${state.price}"><span style="white-space:nowrap">만원</span><button class="btn" style="white-space:nowrap">계산하기</button></div></label></form>
    <div id="calc-result" aria-live="polite">${calcResult()}</div>${official}
  </div>
</details>
<details class="feature-disclosure">
  <summary><div><span class="section-no">02</span><span><strong>용어·계산 기준 보기</strong><small>최대 허용 전세금과 한도 초과분의 의미를 확인합니다.</small></span></div><b>보기</b></summary>
  <div class="disclosure-body compact-info"><p><b>최대 허용 전세금</b><br>지원한도 × 입주인원별 배수</p><p><b>한도 초과분</b><br>매물 전세금 − 지원한도</p><p>기본 임대보증금, 월 임대료, 관리비 등은 별도입니다.</p></div>
</details>`,
check:()=>{const selected=state.selectedProperty,items=filteredListings();return selected?`${header('매물 상세 조건 확인','선택한 매물이 내 조건에 맞는지 항목별로 확인하세요.')}
<div class="selected-property-card">
  <div>${room}</div>
  <div><span class="pill">${esc(selected.type)}</span><h2>${esc(selected.name)}</h2><p>${esc(selected.address)}</p><strong>전세 ${money(selected.price)}</strong></div>
  <div class="selected-property-actions"><button class="btn secondary" id="back-to-listings">← 다른 매물 보기</button><button class="btn" data-page="calc">추가부담 계산</button></div>
</div>
<details class="feature-disclosure" open>
  <summary><div><span class="section-no">01</span><span><strong>내 조건과 매물 비교</strong><small>면적·주택유형·전입신고·권리관계·임대인 동의를 확인합니다.</small></span></div><b>비교</b></summary>
  <div class="disclosure-body">
    <div class="table-wrap"><table><thead><tr><th>항목</th><th>내 조건</th><th>매물 정보</th><th>결과</th></tr></thead><tbody>
      <tr><td>전세보증금</td><td>최대 ${money(max())}</td><td>${money(selected.price)}</td><td>${badge(selected.price>max()?'미충족':selected.price>state.profile.limit?'추가부담':'충족')}</td></tr>
      <tr><td>전용면적</td><td>${areaMax()}㎡ 이하</td><td><input aria-label="전용면적 제곱미터" id="check-area" type="number" min="0.1" max="10000" step="0.1" value="${state.check.area}"></td><td id="area-status"></td></tr>
      <tr><td>주택유형</td><td>자료상 지원 주택</td><td><select aria-label="주택유형" data-check="type">${opt(['단독','다가구','다세대','연립','아파트','주거용 오피스텔','근린생활시설','확인 필요'],state.check.type)}</select></td><td id="type-status"></td></tr>
      ${[['move','전입신고','가능해야 함'],['rights','제한권리','등기사항 확인 필요'],['consent','임대인 동의','LH 계약방식 동의']].map(([k,n,c])=>`<tr><td>${n}</td><td>${c}</td><td><select aria-label="${n}" data-check="${k}">${opt(k==='rights'?['확인 필요','제한권리 없음','제한권리 있음']:['확인 필요','예','아니오'],state.check[k])}</select></td><td id="${k}-status"></td></tr>`).join('')}
    </tbody></table></div>
    <div id="check-result" aria-live="polite"></div>${official}
  </div>
</details>`:`${header('사용자 조건에 따른 매물 확인','지역·보증금·주택유형을 선택한 뒤 매물을 비교해 보세요.')}
<form id="listing-search-form" class="listing-search-bar">
  <label class="field"><span>지역</span><select name="region">${opt(['전체','서울특별시','경기도','인천광역시'],state.search.region)}</select></label>
  <label class="field"><span>주택유형</span><select name="type">${opt(['전체','다가구','다세대','연립','아파트','주거용 오피스텔'],state.search.type)}</select></label>
  <label class="field"><span>최대 보증금</span><div class="listing-price-input"><input name="maxPrice" type="number" min="0" step="100" value="${state.search.maxPrice}" placeholder="예: 15000"><em>만원</em></div></label>
  <button class="btn" type="submit">조건 적용</button>
</form>
<div class="listing-results-head"><div><span class="section-no">01</span><div><h2>조건에 맞는 매물</h2><p>시연용 예시 매물입니다. 원하는 매물을 선택하면 상세 조건을 확인할 수 있습니다.</p></div></div><span class="pill">${items.length}건</span></div>
<div class="listing-card-grid">
${items.map(x=>`<article class="listing-card">
  ${room}
  <div class="listing-card-body"><span class="pill">${esc(x.type)}</span><h3>${esc(x.name)}</h3><p>${esc(x.address)}</p><div class="listing-card-meta"><span>전세 <strong>${money(x.price)}</strong></span><span>전용 ${x.area}㎡</span></div><button class="btn secondary full" data-select-listing="${x.id}">이 매물 확인하기 →</button></div>
</article>`).join('')||'<div class="card empty">선택한 조건에 맞는 예시 매물이 없습니다. 조건을 조금 넓혀보세요.</div>'}
</div>`},
saved:()=>`${header('나의 매물','관심매물은 바로 확인하고, 진행상태를 한눈에 관리하세요.')}
<div class="page-summary-grid three">
  <div class="summary-tile"><span>전체 매물</span><strong>${state.properties.length}건</strong><small>등록된 관심매물</small></div>
  <div class="summary-tile"><span>진행 중</span><strong>${state.properties.filter(x=>!['계약 완료','반려'].includes(x.stage)).length}건</strong><small>현재 확인 중</small></div>
  <div class="summary-tile"><span>완료</span><strong>${state.properties.filter(x=>x.stage==='계약 완료').length}건</strong><small>계약 완료</small></div>
</div>
<div class="saved-section-head">
  <div><span class="section-no">01</span><div><h2>관심매물</h2><p>등록한 매물과 진행상태를 바로 확인할 수 있습니다.</p></div></div>
  <button class="btn" id="add-property">＋ 매물 등록</button>
</div>
<div class="tabs saved-tabs" aria-label="매물 필터">${['전체','진행 중','완료','반려'].map(x=>`<button class="${filter===x?'active':''}" data-filter="${x}">${x}</button>`).join('')}</div>
<div class="saved-list">
${state.properties.filter(x=>filter==='전체'||filter==='완료'&&x.stage==='계약 완료'||filter==='반려'&&x.stage==='반려'||filter==='진행 중'&&!['계약 완료','반려'].includes(x.stage)).map(x=>`<article class="saved-row">${room}<div><h3>${esc(x.name)}</h3><strong class="blue small">전세 ${money(x.price)}</strong><p class="small muted">${esc(x.address)}</p><span class="pill ${x.stage==='계약 완료'?'green':x.stage==='반려'?'orange':''}">${x.stage}</span><div class="track" aria-hidden="true">${Array.from({length:6},(_,i)=>`<span class="${i<=({'관심매물':0,'중개사 문의':1,'임대인 동의 확인':2,'권리분석 요청':3,'보완 요청':3,'승인':4,'반려':3,'계약 완료':5}[x.stage])?'done':''}"></span>`).join('')}</div></div><div class="saved-actions"><select aria-label="${esc(x.name)} 진행상태" data-stage="${x.id}">${opt(stages,x.stage)}</select><button class="btn secondary" data-load="${x.id}">이 매물 조건 확인 →</button><button class="small muted" data-delete="${x.id}">목록에서 삭제</button></div></article>`).join('')||'<div class="card empty">해당 상태의 매물이 없습니다.</div>'}
</div>`,
agent:()=>{const agents=[
  {name:'행복부동산 공인중개사사무소',area:'광진구 자양동',deals:12,rights:18,years:'전세임대 4년',tag:'계약 경험 다수'},
  {name:'청년주거 부동산',area:'광진구 화양동',deals:9,rights:14,years:'전세임대 3년',tag:'청년전세 상담'},
  {name:'온하우스 공인중개사사무소',area:'성동구 성수동',deals:8,rights:11,years:'전세임대 3년',tag:'권리분석 경험'},
  {name:'한걸음 공인중개사사무소',area:'동대문구 장안동',deals:6,rights:10,years:'전세임대 2년',tag:'임대인 협의 경험'}
];return `${header('공인중개사 찾기','전세임대 경험이 있는 중개업소를 여러 곳 비교해 보세요.')}
<div class="agent-intro-row">
  <div><span class="section-no">01</span><div><h2>전세임대 경험 중개사</h2><p>아래 정보는 기능 시연을 위한 예시 데이터입니다.</p></div></div>
  <span class="pill">총 ${agents.length}곳</span>
</div>
<div class="agent-card-grid">
${agents.map((a,i)=>`<article class="agent-card">
  <div class="agent-card-top">
    <div class="agent-avatar"><svg class="blue"><use href="#brand"/></svg></div>
    <div><span class="pill ${i===0?'orange':''}">${a.tag}</span><h3>${a.name}</h3><p>${a.area}</p></div>
  </div>
  <div class="agent-card-stats">
    <div><span>실제 계약 성사</span><strong>${a.deals}<small>건</small></strong></div>
    <div><span>권리분석 진행</span><strong>${a.rights}<small>건</small></strong></div>
  </div>
  <div class="agent-card-foot"><span>${a.years}</span></div>
  <details class="agent-detail">
    <summary>상세 보기</summary>
    <div class="agent-card-detail">
      <div class="keyrow"><span>집계기간</span><strong>예시 데이터</strong></div>
      <div class="keyrow"><span>주요 경험</span><strong>${a.tag}</strong></div>
      <div class="keyrow"><span>증빙자료</span><strong>실제 서비스 연동 시 확인 예정</strong></div>
    </div>
  </details>
</article>`).join('')}
</div>
<div class="info agent-note">실제 서비스에서는 검증된 실적, 지역, 상담 가능 여부 등을 기준으로 비교할 수 있도록 설계하는 방향입니다.</div>`}
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
function bind(){if(page==='home'){document.querySelectorAll('.home-recent [data-load]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();const x=state.properties.find(v=>String(v.id)===b.dataset.load);if(!x)return;selectProperty({id:'S'+x.id,name:x.name,address:x.address,price:x.price,area:'',type:'확인 필요',move:'확인 필요',rights:'확인 필요',consent:'확인 필요'});go('check')})}if(page==='profile'){
const f=$('#profile-form'),sf=$('#simulation-form');
['region','people'].forEach(n=>f.elements[n].addEventListener('change',()=>{f.elements.limit.value='';$('#limit-help').textContent='변경한 지역·입주인원에 해당하는 선정통보의 지원한도를 입력해 주세요.'}));
f.onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(f));if(d.deadline<d.selected){toast('계약기한은 선정일 이후로 입력해 주세요.');return}d.limit=Number(d.limit);state.profile={...state.profile,...d};save();render();toast('지원정보를 저장했습니다.')};
sf.onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(sf));const read=(prefix,key)=>assetNum(d[prefix+'_'+key]);const keys=['deposit','stock','car','rentalDeposit','realEstate','debt'];state.simulation.firstRank=d.firstRank;state.simulation.familyIncome100=d.familyIncome100;state.simulation.selfIncome100=d.selfIncome100;keys.forEach(k=>{state.simulation.self[k]=read('self',k);state.simulation.parents[k]=read('parents',k)});save();$('#simulation-result').innerHTML=simulationResultHtml();toast('모의계산 결과를 반영했습니다.')};
}if(page==='calc')$('#calc-form').onsubmit=e=>{e.preventDefault();state.price=Number(new FormData(e.target).get('price'));save();

$('#calc-result').innerHTML=calcResult()};if(page==='check'){
if(state.selectedProperty){
  checkResult();
  $('#check-area').oninput=e=>{state.check.area=e.target.value;state.selectedProperty.area=e.target.value;save();checkResult()};
  document.querySelectorAll('[data-check]').forEach(el=>el.onchange=()=>{state.check[el.dataset.check]=el.value;state.selectedProperty[el.dataset.check]=el.value;save();checkResult()});
  $('#back-to-listings').onclick=()=>{state.selectedProperty=null;save();render()};
}else{
  const f=$('#listing-search-form');
  f.onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(f));state.search={region:d.region,type:d.type,maxPrice:d.maxPrice};save();render()};
  document.querySelectorAll('[data-select-listing]').forEach(b=>b.onclick=()=>{const x=listingInventory.find(v=>v.id===b.dataset.selectListing);if(!x)return;selectProperty(x);render();toast(x.name+'을 선택했습니다.')});
}}if(page==='saved'){$('#add-property').onclick=()=>$('#modal').showModal();

document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;render()});

document.querySelectorAll('[data-stage]').forEach(el=>el.onchange=()=>{state.properties.find(x=>String(x.id)===el.dataset.stage).stage=el.value;save();render();toast('진행상태를 저장했습니다.')});

document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{if(confirm('이 관심매물을 목록에서 삭제할까요?')){state.properties=state.properties.filter(x=>String(x.id)!==b.dataset.delete);save();render()}});

document.querySelectorAll('[data-load]').forEach(b=>b.onclick=()=>{const x=state.properties.find(v=>String(v.id)===b.dataset.load);if(!x)return;selectProperty({id:'S'+x.id,name:x.name,address:x.address,price:x.price,area:'',type:'확인 필요',move:'확인 필요',rights:'확인 필요',consent:'확인 필요'});go('check');toast(x.name+'의 상세 조건을 확인합니다.')})}}
$('#close-modal').onclick=()=>$('#modal').close();

$('#add-form').onsubmit=e=>{e.preventDefault();

const d=Object.fromEntries(new FormData(e.target));if(!d.name.trim()||!d.address.trim()){toast('매물 이름과 주소를 입력해 주세요.');return}state.properties.push({id:Date.now(),name:d.name.trim(),address:d.address.trim(),price:Number(d.price),stage:'관심매물'});save();

$('#modal').close();e.target.reset();filter='전체';render();toast('관심매물을 등록했습니다.')};

window.addEventListener('hashchange',()=>{const p=location.hash.slice(1);if(titles[p]){page=p;render()}});page=titles[location.hash.slice(1)]?location.hash.slice(1):'home';render();
