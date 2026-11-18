# 가입 명함 OCR 유지보수

`business-card-ocr.js`는 가입 화면의 명함 선택·미리보기·교체·제거, 브라우저 OCR, 계정별 명함 보관을 구현하는 원본입니다. 앱의 React 별칭 `z`와 JSX 런타임 `t`를 사용하는 인라인 모듈이므로 단독 Node 프로그램으로 실행하지 않습니다. 배포 HTML에는 이 소스가 포함되어 있습니다.

## 데이터와 가입 연동

- 명함 이미지는 OCR 서버나 공개 회원 사진 저장소로 전송하지 않습니다. 같은 사이트에서 제공하는 Tesseract worker가 브라우저 안에서 인식합니다.
- 명함은 현재 브라우저의 IndexedDB `kfceo-private-business-cards` / `cards`에 계정 ID를 키로 보관합니다. 다른 기기로 동기화되지 않으며 사이트 데이터 삭제 시 사라집니다. 안내 문구를 가입 화면에서 유지해야 합니다.
- `KfBusinessCardUpload`의 props는 `accountId`, `onRecognized`, `onCardChange`, `onBusyChange`, `disabled`입니다. 인식 결과는 사용자가 입력하지 않은 필드만 채우며, 회사 직함으로 동문회 직책을 덮지 않습니다.
- 명함 객체는 `{ dataUrl, fileName, mimeType, ocrText, recognizedAt }`입니다. `saveKfBusinessCard(accountId, card)`는 비동기 저장이며 `undefined`는 변경 없음, `null`은 삭제입니다. `getKfBusinessCard(accountId)`는 기존 명함을 읽습니다.
- 가입 완료 후 명함 저장이 실패하면 생성된 계정 ID를 유지하고 명함 저장만 재시도합니다. 명함 저장과 공개 프로필 사진 저장은 별개의 동작입니다.

## 엔진 파일과 검증

엔진·worker·WASM·한국어/영어 모델은 `/assets/business-card-ocr`에서 제공됩니다. 고정 버전과 라이선스는 해당 폴더의 README를 참조하세요. JPG/PNG/WebP, 최대 15MB 입력을 받고 긴 변을 최대 2600픽셀로 조정합니다.

수정 시 원본 모듈과 인라인 코드를 함께 갱신하고 추적 중인 25개 HTML이 동일한지 확인합니다. OCR 이름·전화·이메일·주소 파싱, 인식 취소/시간 초과, 이미지 교체, IndexedDB 실패 및 가입 재시도를 가짜 브라우저 API로 검사한 뒤 실제 브라우저에서 인식 결과를 확인합니다. 테스트에는 실제 명함이나 운영 DB 쓰기를 사용하지 않습니다.
