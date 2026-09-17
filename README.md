# 청년전세ON GitHub 업로드용

파일 구성:

- `index.html`: 화면 구조
- `style.css`: 디자인 및 Paperlogy 폰트 연결
- `script.js`: 계산, D-Day, 관심매물 상태관리 등 동작
- `fonts/`: 여기에 본인이 보유한 `Paperlogy-5Medium.ttf` 파일을 넣으세요.

## GitHub 업로드

저장소 루트에 `index.html`, `style.css`, `script.js`, `fonts/` 폴더가 보이도록 업로드하면 됩니다.
GitHub Pages를 사용할 경우 별도 빌드 과정 없이 정적 사이트로 배포할 수 있습니다.

> 폰트 파일은 패키지에 포함하지 않았습니다. 사용자가 보유한 원본 폰트를 `fonts/Paperlogy-5Medium.ttf` 경로에 직접 넣어주세요.

## 공공데이터 API 연동 서버

`server.js`는 API 인증키를 브라우저에 전달하지 않는 서버 프록시입니다.
행정안전부 주소정보 API와 국토교통부 건축HUB API 키를 각각 환경변수로
설정한 뒤 실행합니다.

```powershell
$env:JUSO_API_KEY="행정안전부_승인키"
$env:BUILDING_HUB_API_KEY="건축HUB_일반인증키"
npm start
```

프런트엔드는 `/api/address-search?query=검색어`로 주소를 검색하고,
선택한 주소를 `/api/building-register?address=JSON인코딩된주소객체`로
전달해 건축물대장 표제부를 조회합니다. 조회 결과가 없거나 API 키가
설정되지 않은 경우 임의의 결과를 만들지 않고 오류 또는 빈 결과를 표시합니다.

GitHub Pages처럼 정적 파일만 호스팅하는 환경에서는 서버 프록시를 실행할 수
없습니다. 실제 연동은 Node 서버, 서버리스 함수 또는 별도 백엔드에 이
프록시를 배포해야 하며, 키는 반드시 배포 환경의 Secret/Environment Variable로
관리해야 합니다. 프런트엔드 경로를 바꿀 때는 다음 설정을 사용할 수 있습니다.

```html
<script>
  window.JEONSE_ON_CONFIG = {
    addressSearchEndpoint: '/api/address-search',
    buildingSearchEndpoint: '/api/building-register'
  };
</script>
```
