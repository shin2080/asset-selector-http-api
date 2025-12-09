# Adobe AEM Cloud Asset Selector & HTTP API Demo

Adobe AEM Cloud의 Asset Selector와 Asset HTTP API를 vanilla JavaScript로 구현한 샘플 사이트입니다.

## 주요 기능

### Asset Selector
- 에셋 검색 및 필터링
- 다중 에셋 선택
- 선택한 에셋을 서버 폴더에 저장
- 메타 스키마 JSON 표시
- 커스텀 필터 패널
- 샘플 코드 제공

### HTTP API
- **List**: 특정 경로의 에셋 리스트 조회
- **Upload**: 에셋 업로드 (위치 지정)
- **Download**: 에셋 다운로드 (원본/웹용/썸네일)
- **Get Metadata**: 에셋 메타 스키마 조회 (JSON)
- **Update Metadata**: 에셋 메타 스키마 업데이트

### Settings
- AEM 서버 정보 설정
- 인증 키 관리 (IMS Org, API Key, Access Token)
- 경로 설정 (브라우징, 업로드, 다운로드, 저장)
- Asset Selector 옵션
- API 옵션

## 시작하기

### 요구사항
- 웹 브라우저 (Chrome, Firefox, Safari, Edge)
- (선택) Node.js 12+ (개발 서버 실행 시)

### 실행 방법

#### 방법 1: Node.js 서버 사용
```bash
# 프로젝트 디렉토리로 이동
cd asset-selector-http-api

# 서버 실행
npm start
# 또는
node server/server.js

# 브라우저에서 http://localhost:3000 접속
```

#### 방법 2: Python 서버 사용
```bash
# Python 3
python -m http.server 3000

# Python 2
python -m SimpleHTTPServer 3000
```

#### 방법 3: 직접 열기
`index.html` 파일을 브라우저에서 직접 열 수 있습니다.
(CORS 제한으로 인해 일부 기능이 제한될 수 있음)

## 설정

### 1. AEM Cloud 설정

Settings 페이지에서 다음 정보를 설정합니다:

```
Server Configuration:
- AEM Host URL: https://author-pXXXX-eXXXX.adobeaemcloud.com
- Delivery URL: https://delivery-pXXXX-eXXXX.adobeaemcloud.com
- Repository ID: your-repository-id

Authentication:
- IMS Organization ID: YOUR_ORG@AdobeOrg
- API Key: your-api-key
- Access Token: your-access-token
```

### 2. Access Token 발급

Adobe Developer Console에서 Service Account (JWT) 또는 OAuth 인증을 통해 Access Token을 발급받습니다:

1. [Adobe Developer Console](https://developer.adobe.com/console/) 접속
2. 프로젝트 생성 또는 선택
3. AEM Assets API 추가
4. 인증 정보 생성 및 토큰 발급

## 프로젝트 구조

```
asset-selector-http-api/
├── index.html              # 메인 HTML
├── package.json            # Node.js 패키지 설정
├── README.md               # 문서
├── css/
│   └── style.css           # 스타일시트
├── js/
│   ├── config.js           # 설정 관리
│   ├── utils.js            # 유틸리티 함수
│   ├── api-client.js       # AEM HTTP API 클라이언트
│   ├── asset-selector.js   # Asset Selector 구현
│   └── app.js              # 메인 애플리케이션
└── server/
    └── server.js           # 개발 서버
```

## API 사용 예제

### Asset Selector 초기화
```javascript
const assetSelector = new AEMAssetSelector({
    imsOrg: 'YOUR_IMS_ORG',
    imsToken: 'YOUR_IMS_TOKEN',
    apiKey: 'YOUR_API_KEY',
    repositoryId: 'YOUR_REPO_ID',
    env: 'PROD'
});

// 셀렉터 열기
assetSelector.open({
    onSelect: (assets) => {
        console.log('Selected:', assets);
    },
    onClose: () => {
        console.log('Selector closed');
    }
});
```

### HTTP API 클라이언트
```javascript
const api = new AEMAssetAPI({
    host: 'https://author-xxx.adobeaemcloud.com',
    token: 'YOUR_ACCESS_TOKEN'
});

// 에셋 리스트 조회
const assets = await api.listAssets('/content/dam/my-folder', { limit: 20 });

// 에셋 업로드
const result = await api.uploadAsset(file, '/content/dam/uploads');

// 메타데이터 조회
const metadata = await api.getMetadata('/content/dam/image.jpg');

// 메타데이터 업데이트
await api.updateMetadata('/content/dam/image.jpg', {
    'dc:title': 'New Title',
    'dc:description': 'Updated description'
});

// 에셋 다운로드
const blob = await api.downloadAsset('/content/dam/image.jpg', 'original');
```

### 필터 설정
```javascript
assetSelector.setFilters({
    assetType: ['image', 'video'],
    format: ['jpg', 'png'],
    sizeRange: { min: 0, max: 10485760 },
    dateRange: { from: '2024-01-01', to: '2024-12-31' },
    path: '/content/dam/my-folder'
});

assetSelector.applyFilters();
```

## 데모 모드

AEM 서버 설정 없이도 데모 모드로 기능을 테스트할 수 있습니다.
설정이 없으면 자동으로 모의 데이터가 표시됩니다.

## 브라우저 지원

- Chrome (최신)
- Firefox (최신)
- Safari (최신)
- Edge (최신)

## 참고 자료

- [AEM Assets HTTP API](https://experienceleague.adobe.com/docs/experience-manager-cloud-service/content/assets/admin/mac-api-assets.html)
- [Asset Selector for AEM as a Cloud Service](https://experienceleague.adobe.com/docs/experience-manager-cloud-service/content/assets/manage/asset-selector.html)
- [Adobe Developer Console](https://developer.adobe.com/console/)

## 라이선스

MIT License
