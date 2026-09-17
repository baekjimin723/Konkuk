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

## 주소 자동완성 API 프록시

주소 입력 자동완성은 브라우저에서 행정안전부 API 키를 직접 사용하지 않고
`/api/address-search?query=검색어` 서버 프록시를 호출합니다. 프록시 서버에서
`confmKey`를 환경변수로 관리하고, 행정안전부 검색 API의 응답을 JSON으로
전달해야 합니다. 프런트엔드에서 다른 프록시 경로를 사용할 경우 로드 전에
`window.JEONSE_ON_CONFIG = { addressSearchEndpoint: '/내-프록시-경로' }`를
설정할 수 있습니다.

프록시는 최소 2글자 검색어만 허용하고 행정안전부 API의 `juso` 배열과 주소
필드(`roadAddr`, `jibunAddr`, `zipNo`, `admCd`, `rnMgtSn`, `bdMgtSn`,
`bdNm`)를 그대로 반환하는 구성을 권장합니다.
