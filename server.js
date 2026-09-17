import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const jusoKey = process.env.JUSO_API_KEY;
const buildingKey = process.env.BUILDING_HUB_API_KEY;

const sendJson = (res, status, body) => {
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
  res.end(JSON.stringify(body));
};

const apiError = (res, status, message) => sendJson(res, status, {error: message});

function value(item, names) {
  for (const name of names) {
    if (item?.[name] !== undefined && item[name] !== null && String(item[name]).trim()) return String(item[name]).trim();
  }
  return '';
}

function buildingParams(address) {
  const bdMgtSn = value(address, ['bdMgtSn']);
  const admCd = value(address, ['admCd']);
  const sigunguCd = value(address, ['sigunguCd']) || bdMgtSn.slice(0, 5) || admCd.slice(0, 5);
  const bjdongCd = value(address, ['bjdongCd']) || bdMgtSn.slice(5, 10) || admCd.slice(5, 10);
  const platGbCd = value(address, ['platGbCd']) || (value(address, ['mtYn']) === '1' ? '1' : '0');
  const bun = value(address, ['bun', 'lnbrMnnm']).padStart(4, '0');
  const ji = value(address, ['ji', 'lnbrSlno']).padStart(4, '0');
  if (!sigunguCd || !bjdongCd || !bun || !ji) throw new Error('선택한 주소에 건축물대장 조회용 지번 정보가 없습니다.');
  return {sigunguCd, bjdongCd, platGbCd, bun, ji};
}

async function addressSearch(url, res) {
  if (!jusoKey) return apiError(res, 503, 'JUSO_API_KEY 환경변수가 설정되지 않았습니다.');
  const query = (url.searchParams.get('query') || '').trim();
  if (query.length < 2) return sendJson(res, 200, {results: []});
  const upstream = new URL('https://business.juso.go.kr/addrlink/addrLinkApi.do');
  upstream.search = new URLSearchParams({
    confmKey: jusoKey, currentPage: '1', countPerPage: '5', keyword: query,
    hstryYn: 'Y', firstSort: 'road', addInfoYn: 'Y', resultType: 'json'
  });
  const response = await fetch(upstream);
  if (!response.ok) return apiError(res, 502, `주소 API 오류 (${response.status})`);
  const data = await response.json();
  const results = data?.results?.juso || [];
  sendJson(res, 200, {results});
}

function mapBuilding(item) {
  return {
    buildingName: value(item, ['bldNm', 'bdNm', 'buildingName']),
    mainPurpose: value(item, ['mainPurpsCdNm', 'mainPurpsCd', 'mainPurpose']),
    etcPurpose: value(item, ['etcPurps', 'etcPurpose']),
    structure: value(item, ['strctCdNm', 'strctCd', 'structure']),
    totalArea: value(item, ['totArea', 'totalArea']),
    buildingArea: value(item, ['archArea', 'buildingArea']),
    floors: value(item, ['grndFlrCnt', 'groundFloorCount']),
    undergroundFloors: value(item, ['ugrndFlrCnt', 'undergroundFloorCount']),
    approvalDate: value(item, ['useAprDay', 'useApprovalDate']),
    data: item
  };
}

async function buildingSearch(url, res) {
  if (!buildingKey) return apiError(res, 503, 'BUILDING_HUB_API_KEY 환경변수가 설정되지 않았습니다.');
  let address;
  try { address = JSON.parse(url.searchParams.get('address') || ''); } catch { return apiError(res, 400, '주소 정보 형식이 올바르지 않습니다.'); }
  let params;
  try { params = buildingParams(address); } catch (error) { return apiError(res, 400, error.message); }
  const upstream = new URL('https://apis.data.go.kr/1613000/BldRgstService_v2/getBrTitleInfo');
  upstream.search = new URLSearchParams({
    serviceKey: buildingKey, _type: 'json', sigunguCd: params.sigunguCd,
    bjdongCd: params.bjdongCd, platGbCd: params.platGbCd, bun: params.bun,
    ji: params.ji, numOfRows: '100', pageNo: '1'
  });
  const response = await fetch(upstream);
  if (!response.ok) return apiError(res, 502, `건축물대장 API 오류 (${response.status})`);
  const data = await response.json();
  const items = data?.response?.body?.items?.item || [];
  const list = Array.isArray(items) ? items : [items];
  if (!list.length || !list[0]) return sendJson(res, 200, {items: [], query: params});
  sendJson(res, 200, {items: list.map(mapBuilding), query: params});
}

async function staticFile(pathname, res) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = normalize(join(root, requested));
  if (!file.startsWith(root)) return apiError(res, 403, '접근이 거부되었습니다.');
  try {
    const body = await readFile(file);
    const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.ttf': 'font/ttf'};
    res.writeHead(200, {'Content-Type': types[extname(file)] || 'application/octet-stream'});
    res.end(body);
  } catch { apiError(res, 404, '파일을 찾을 수 없습니다.'); }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method !== 'GET') return apiError(res, 405, 'GET 요청만 지원합니다.');
    if (url.pathname === '/api/address-search') return await addressSearch(url, res);
    if (url.pathname === '/api/building-register') return await buildingSearch(url, res);
    return await staticFile(url.pathname, res);
  } catch (error) {
    console.error(error);
    apiError(res, 502, '공공데이터 API 요청을 처리하지 못했습니다.');
  }
}).listen(port, () => console.log(`청년전세ON 서버: http://localhost:${port}`));
