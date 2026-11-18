# 회원 사진 동기화 유지보수

이 폴더는 배포된 `index.html`의 회원 사진 저장·조회·렌더링 로직과 회귀 검증을 보관합니다. 테스트는 저장소 루트의 실제 `index.html`을 읽습니다. 현재 작업 디렉터리에 의존하지 않으며 HTML이나 운영 Firebase 데이터를 변경하지 않습니다.

## 파일

- `photo-sync-store.js`: 공유 사진 캐시, 회원별 실시간 구독, 서버 저장 확인, 재연결 처리의 원본 코드. HTML 안의 기존 앱 변수와 함께 실행되는 코드이므로 독립 Node 프로그램이 아닙니다.
- `patch-photo-callers.cjs`: 사진 업로드·URL 저장·초기화·AI 적용·가입 호출부를 수정하는 `patchPhotoCallers(html)` 함수와 저장 확인/UI 잠금 도우미.
- `patch-photo-readers.cjs`: 회원 식별자와 사진 출처를 통일하는 `patchPhotoReaders(html)` 함수. 반환값은 `{ html, changes }`입니다.
- `patch-photo-images.cjs`: 회원 사진을 `SharedMemberImage`로 연결하는 `patchPhotoImages(html)` 함수. 반환값은 `{ html, changes, images }`입니다.
- `tests/`: 실제 HTML의 코드를 추출하고 가짜 서버·회원·UI 상태로 검증합니다.

패치 함수는 적용 전의 예상 문자열과 개수를 확인합니다. 이미 적용된 HTML에 다시 실행하면 오류로 중단하는 것이 정상입니다. 현재 HTML 검증에는 아래 테스트를 사용하세요. `patch-photo-callers.cjs`를 직접 실행하면 적용 여부를 감지하고 메모리에서만 문법을 확인합니다.

## 검증 명령

Node.js 20 이상과 Git을 사용합니다. 별도 패키지 설치는 필요 없습니다. 다음은 저장소 루트에서 실행하는 명령입니다.

```powershell
node maintenance/photo-sync/tests/photo-sync-store.cjs
node maintenance/photo-sync/tests/photo-callers.cjs
node maintenance/photo-sync/tests/photo-readers.cjs
node maintenance/photo-sync/tests/search-photo-sync.cjs
node maintenance/photo-sync/patch-photo-callers.cjs
```

검증 범위는 다음과 같습니다.

- 저장 실패·시간 초과·늦은 응답·동시 저장 및 재연결 시 확정 사진 유지
- 권한 확인, 서버 응답 전 로컬 사진 미변경, 실패 시 성공 안내와 창 닫기 방지, 버튼 잠금 해제
- 단일/일괄 AI 저장·초기화에서 실패 결과 전파, 신규가입 사진의 실제 계정 ID 사용
- 기존 원우 ID, 신규 UUID, 명시적 `directoryId`, 과거 `c기수-번호` 식별자, 동명이인 구분
- 주소록 검색 결과·미니홈피의 실시간 사진 변경 및 초기화

`photo-readers.cjs`와 `search-photo-sync.cjs`는 첫 인자로 다른 HTML 파일 경로를 받을 수 있습니다. `--preview-readers`와 `--preview-images`는 적용 전 HTML에 패치를 메모리에서 적용해 확인하는 개발용 옵션입니다. `--baseline`은 저장소의 과거 커밋을 읽는 회귀 확인용이며 현재 배포 검증에는 사용하지 않습니다.

## 저장 형식과 실시간 동기화

Firebase Realtime Database의 `alumniPhotos/{memberId}` 값은 **문자열**입니다. 업로드한 이미지의 data URL 또는 이미지 URL을 저장합니다. 초기화는 키 삭제가 아니라 빈 문자열 `""`을 저장합니다. 이 값은 명시적인 초기화 표시이며, 브라우저에 남아 있는 과거 `minihompy.profileImage`를 다시 표시하지 않도록 원본 사진 또는 빈 상태로 해석합니다. 기존 문자열 데이터와의 호환성을 유지하며 임의로 객체 형식으로 바꾸지 마세요.

명시적으로 연결된 `directoryId`가 있으면 그 ID를 사용하고, 그렇지 않으면 실제 회원 ID를 사용합니다. 이름만으로 다른 회원의 사진 ID를 결정하지 않습니다. 과거 `c5-3` 같은 식별자는 `alumni-5-3`으로 정규화합니다.

사진 쓰기는 Firebase REST 요청의 성공 응답과 반환값을 확인한 뒤 확정합니다. 요청 제한 시간은 15초이며 같은 회원의 쓰기는 순서대로 처리합니다. 실패한 요청은 성공으로 표시하거나 로컬 계정 사진에 반영하지 않습니다. 이미지 데이터 또는 URL 문자열을 공유하며, 배포 서버의 정적 사진 파일을 덮어쓰는 방식은 아닙니다.

`SharedMemberImage`는 화면 근처에 있는 회원 사진만 회원별로 구독합니다. 구독은 같은 ID끼리 공유하고 마지막 화면이 해제될 때 정리합니다. 사진 전체 컬렉션을 한 번에 내려받지 않습니다. 온라인 복귀·창 활성화·다른 탭의 확정 저장 알림은 활성 회원 사진을 다시 확인합니다. 로컬 캐시는 용량을 제한하며 서버 조회를 대신하지 않습니다.

## 빌드와 25개 HTML 사본

이 저장소는 동일한 앱을 경로별 HTML 25개에 포함합니다. 변경 후에는 최종 `index.html`의 내용을 **추적 중인 25개 HTML 전체에 동일하게 반영**해야 합니다. 일부 경로만 바꾸면 주소록과 미니홈피가 서로 다른 동기화 코드를 실행할 수 있습니다.

1. 저장 로직 또는 필요한 패치 도우미를 수정합니다. 패치 함수는 적용 전 원본을 대상으로 순서와 정확한 일치 여부를 확인해 사용합니다.
2. 중앙 저장 코드와 호출부·조회부·이미지 렌더링을 포함한 최종 HTML 한 개를 만듭니다. 적용 완료된 HTML에 패치를 중복 적용하지 않습니다.
3. 위 테스트와 모듈 문법 검사를 실행합니다.
4. 최종 내용을 25개 HTML 사본에 반영하고 모두 동일한지 확인한 뒤 배포합니다. 이 유지보수 패키지 자체는 HTML 복사나 배포를 자동 실행하지 않습니다.

저장소 루트에서 다음 읽기 전용 명령으로 HTML 개수와 동일성을 확인할 수 있습니다.

```powershell
node -e "const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');const files=cp.execFileSync('git',['ls-files','*.html'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);const hashes=new Set(files.map(f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')));if(files.length!==25||hashes.size!==1)throw Error('HTML count/content mismatch: '+files.length+' files, '+hashes.size+' hashes');console.log('PASS: all 25 HTML files are identical');"
```

브라우저 최종 확인에서는 서로 다른 두 세션에서 같은 회원 사진을 보고, 한쪽에서 변경한 사진이 다른 쪽에도 반영되는지 확인합니다. 저장 실패 시 기존 사진 유지와 오류 안내, 초기화 후 오래된 로컬 사진이 되살아나지 않는지도 확인합니다.
