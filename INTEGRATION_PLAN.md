# Frontend ↔ Backend 통합 계획

본 문서는 [frontend-ui/services.js](frontend-ui/services.js)의 11개 함수와
[pip/orchestrator.py](pip/orchestrator.py)가 제공하는 백엔드 API를 비교하여
**무엇이 즉시 연결 가능하고 무엇이 추가 작업이 필요한지** 정리한다.

코드는 아직 어떤 것도 수정하지 않았다. 본 문서는 분석 산출물이다.

---

## 1. 백엔드 API 인벤토리 (orchestrator.py 기준)

### 1.1 Gateway 직접 엔드포인트 (`pip/orchestrator.py`)

| 메서드 | 경로 | 입력 | 출력 |
|---|---|---|---|
| GET  | `/api/check_user_id?id=...`     | query `id` | `{ exists: boolean }` |
| POST | `/api/validate_pose`            | `{ image_data: base64, expected_type: 'front'\|'left45'\|'right45'\|'left90'\|'right90' }` | `{ status, message, yaw }` |
| POST | `/api/register`                 | `{ user_id, mode, images: { front, left45, right45, left90, right90 } }` | `{ status, user_id }` |
| POST | `/api/start-from-crawl`         | `{ user_id }` | `{ job_id }` |
| GET  | `/api/stream/{job_id}`          | (SSE) | `event: connected/update/end` w/ `step/status/message/data/ts` |
| GET  | `/api/health`                   | — | per-service `{ ok, code }` 맵 |

### 1.2 마운트된 모듈 라우터

| Prefix | 출처 | 주요 엔드포인트 |
|---|---|---|
| `/api/monitor/*` | `module_crawl_takedown/server.py` | `/stats` `/live-images` `/logs` `/run-now` |
| `/api/*` (takedown) | 동일 | `/items_count` `/latest_items` `/upload` `/clear_uploaded` `/update_tags` `/takedown/candidate/add` `/takedown/candidates` `/takedown/create_from_tag` `/takedown/create_from_candidate` `/takedown/mark_sent` `/takedown/run_tracker` `/notifications` |
| `/extract/*` | `module_vector_extract` | `/extract/` (POST) `/extract/batch` (POST) |
| `/compare/*` | `module_vector_match` | `/compare/batch` (POST) `/compare/status` (GET) `/compare/single` (POST) |

### 1.3 Proxy 경로

| Prefix | 대상 서비스 | 비고 |
|---|---|---|
| `/evidence/*`                  | Evidence Collection Module (`localhost:13000`) | 노출 엔드포인트: `GET /api/evidence` → `{id, image_url, is_deepfake, is_deleted}` 행 목록 |
| `/register-ui/register-api/api/*` | User photo register system_new (`localhost:13001`) | `/api/register`, `/api/check_user_id`, `/api/users` 미러링 |

### 1.4 핵심 관찰

- **인증/계정 시스템이 존재하지 않는다.** email/password, JWT, 세션 모두 없음. 식별자는 `user_id` 단일 문자열.
- **얼굴 등록(`/api/register`)은 5각도를 한 번에 받는다.** 프론트의 슬롯별 점진적 업로드와 패턴이 다름.
- **분석 진행은 SSE 스트림(`/api/stream/{job_id}`)으로만 노출된다.** REST 폴링 엔드포인트는 없음.
- **분석 결과는 Evidence DB에 적재**되지만 `job_id`/`user_id`로 필터링하는 조회 API가 없다. 또한 frontend `Match` 타입의 `domain/date/time/similarity/note`에 대응하는 컬럼이 부재 (현재 `id, image_url, is_deepfake, is_deleted`만 존재).

---

## 2. 매핑 테이블

| # | Frontend 함수 | Frontend가 기대하는 호출 | 백엔드 매칭 | 상태 |
|---|---|---|---|---|
| 1  | `setAuthToken(token)`                          | (클라이언트 전용)                                  | n/a (백엔드 호출 없음)                                                        | ✅ 손댈 것 없음 |
| 2  | `login(email, password)`                       | `POST /auth/login` → `{ token, user }`             | 없음 (auth 시스템 자체가 없음)                                                | ❌ 백엔드 추가 필요 |
| 3  | `signup(profile)`                              | `POST /auth/signup` → `{ token, user }`            | `/api/register` 존재하나 의미 다름 (얼굴 등록, email/pwd/name/birth/gender 미수용) | ❌ 백엔드 + 프론트엔드 둘 다 수정 필요 |
| 4  | `logout()`                                     | `POST /auth/logout`                                | 없음 (auth 없음)                                                              | ❌ 백엔드 추가 필요 (또는 클라이언트 전용으로 축소) |
| 5  | `checkEmailDuplicate(email)`                   | `GET /auth/check-email?email=...`                  | `GET /api/check_user_id?id=...` (user_id 기준)                                | ⚠️ 어댑터 필요 (user_id == email 합의 시) |
| 6  | `uploadFacePhoto(angleKey, fileBlob, dataUrl)` | `POST /face-photos` (multipart, 1장씩)             | `POST /api/validate_pose` (1장 검증) + `POST /api/register` (5장 일괄 저장)   | ⚠️ 어댑터 필요 (검증/저장 분리, 5장 모음 후 일괄 제출) |
| 7  | `startAnalysis()`                              | `POST /analysis` → `{ analysisId }`                | `POST /api/start-from-crawl` body `{user_id}` → `{job_id}`                    | ⚠️ 어댑터 필요 (user_id 주입 + 키 리매핑) |
| 8  | `getAnalysisProgress(analysisId)`              | `GET /analysis/{id}/progress` (1초 폴링) → `{scannedImages, domainsScanning, secondsRemaining, done}` | SSE `GET /api/stream/{job_id}` (event-based, step/status/message/data/ts) | ❌ 백엔드 + 프론트엔드 둘 다 수정 필요 (패러다임 차이) |
| 9  | `getAnalysisResults(analysisId)`               | `GET /analysis/{id}/results` → `Match[]`           | `GET /evidence/api/evidence` (전체, 필터 없음, 필드 부족)                     | ❌ 백엔드 + 프론트엔드 둘 다 수정 필요 (job 필터 + 누락 필드 보강) |
| 10 | `submitDeletionRequest(matchIds, consents, memo)` | `POST /deletion-requests` → `RequestReceipt`       | `module_crawl_takedown`의 `takedown/candidate/add` + `create_from_candidate` + `mark_sent` (다단계, consents/memo 미수용) | ❌ 백엔드 + 프론트엔드 둘 다 수정 필요 |
| 11 | `getRequestStatus(filter)`                     | `GET /deletion-requests?status=...` → `StatusOverview` (3-stage retry 진행도 포함) | `/api/takedown/candidates`, `/api/notifications` 존재하나 사용자 범위/재시도 모델 없음 | ❌ 백엔드 추가 필요 |
| 12 | `getDashboardSummary()`                        | `GET /dashboard/summary` → 누적 통계               | 없음 (`/api/monitor/stats`로 일부 합성 가능)                                  | ❌ 백엔드 추가 필요 |

---

## 3. 카테고리 분류

### ✅ 바로 연결 가능 (1건)
- **`setAuthToken`** — 클라이언트 전용 상태 저장. 변경 불필요.

### ⚠️ 어댑터로 즉시 처리 가능 (3건)
- **`checkEmailDuplicate(email)`** → `GET /api/check_user_id?id=${email}` 호출. **단, "user_id 필드에 email 문자열을 그대로 넣어서 운용한다"는 운영 합의가 선결되어야 함.** 또는 백엔드에 별칭 `?email=` 쿼리만 추가하면 됨.
- **`startAnalysis()`** → `POST /api/start-from-crawl` 호출. `user_id`는 AuthContext가 보유한 식별자(또는 등록 단계에서 받은 값)에서 주입. 응답 `{job_id}`를 `{analysisId: job_id}`로 키 리네임.
- **`uploadFacePhoto`** → 호출 시 `/api/validate_pose`로 실시간 검증만 수행하고, 통과한 5장의 `dataUrl`을 클라이언트 측에서 모아두었다가 capture 흐름 마지막 시점에 `/api/register`로 일괄 제출하도록 어댑터 작성. **이 경우 `services.uploadFacePhoto`의 의미가 "검증 + 클라이언트 캐시 적재"로 바뀌고, 별도 `services.commitFaceRegistration()` 함수를 추가하는 편이 깔끔함** (해당 함수 추가는 services.js만 수정).

### ❌ 백엔드 추가 필요 (4건)
- **`login`, `signup`, `logout`** — 인증 시스템 전체 신규 구현 필요. JWT/세션, users 테이블에 email/password_hash/name/birth/gender 컬럼, 비밀번호 해싱 정책. 가장 큰 단일 작업.
- **`getRequestStatus`** — 사용자별 takedown 요청 추적 + 3-stage retry 진행도(`progress: [1,1,0]`) 모델. 현재 takedown 모듈은 candidate 단위 운영이고 user-scoped 조회/재시도 회수 추적이 부재. 데이터 모델부터 신규.
- **`getDashboardSummary`** — `totalIndexed/matchesFound/processed/lastScan/averageDuration/scanScope` 집계 엔드포인트. `/api/monitor/stats` + Evidence DB count로 합성 가능하나 **서버측에 단일 엔드포인트로 묶는 것이 권장** (프론트 N개 호출 회피).

### ❌ 백엔드 + 프론트엔드 둘 다 수정 필요 (3건)
- **`signup`** — 백엔드는 위와 같이 auth 신규 구현, 프론트는 응답으로 받은 식별자를 face register 흐름의 `user_id`로 연결하는 흐름을 맞춰야 함 (현재 두 개념이 분리되어 있음).
- **`getAnalysisProgress`** — 패러다임 차이. **권장 방향: 프론트엔드를 `EventSource` 기반 SSE 구독으로 변경.** 단, 프론트가 기대하는 `{scannedImages, domainsScanning, secondsRemaining, done}` 형태와 백엔드의 step/status 이벤트는 정보의 종류가 다름. 둘 중 하나 선택:
  - (A) 프론트 양보: AnalyzingScreen UI를 step 진행 표시로 재설계.
  - (B) 백엔드 양보: 파이프라인이 매 tick마다 누적 카운터를 같이 emit하도록 보강 + REST `/api/analysis/{job_id}/progress` 폴링 엔드포인트 신설. 이쪽이 [frontend-ui/HANDOFF.md](frontend-ui/HANDOFF.md)의 데이터 계약을 보존.
- **`getAnalysisResults`** — 백엔드: Evidence 행에 `domain/date/time/similarity/note` 필드 추가 + `job_id` 또는 `user_id`로 필터하는 쿼리 파라미터 도입. 프론트: 어댑터에서 `is_deepfake`를 `note`로 변환하거나 새 필드와 매칭.
- **`submitDeletionRequest`** — 백엔드: `matchIds[]`를 받아 takedown 모듈로 fan-out하는 단일 엔드포인트 + `consents/memo` 컬럼 + 영수증(`receiptId/legalBasis/sentAt/trackable`) 발급. 프론트: `Match.id`가 백엔드 evidence ID와 일치하도록 보장 (위 `getAnalysisResults` 보강과 짝).

---

## 4. 권장 작업 순서

### Phase 1 — 어댑터만으로 동작하는 부분부터 (백엔드 무수정)

1. **`services.startAnalysis()`** — `POST /api/start-from-crawl` 매핑. `user_id` 확보 경로 합의(현재는 register 흐름 후 보유 가정).
2. **`services.checkEmailDuplicate()`** — `GET /api/check_user_id?id=${email}` 매핑. 운영 합의 또는 백엔드에 `?email` alias 1줄 추가.
3. **`services.setAuthToken`** — 그대로 유지. (auth 미존재 단계에서는 토큰이 dummy여도 호출 흐름은 깨지지 않음.)
4. **`services.uploadFacePhoto`** — `validate_pose` 호출로 변경 + 클라이언트 캐시 적재. capture 완료 시 `commitFaceRegistration()`(신규, services.js에만 추가) → `/api/register` 일괄 제출.

이 단계만으로 **얼굴 등록 → 분석 시작**까지의 골격 흐름이 데모 가능 (인증 없이도).

### Phase 2 — 백엔드 소규모 보강 + 어댑터

5. **`services.getAnalysisResults()`**
   - 백엔드: Evidence 테이블에 `domain TEXT, captured_at TEXT, similarity REAL, note TEXT, user_id TEXT, job_id TEXT` 컬럼 추가. `run_pipeline_from_crawl`에서 INSERT 시 함께 채움. `GET /evidence/api/evidence?user_id=...&job_id=...` 필터 지원.
   - 프론트: 어댑터에서 `Match` 타입으로 변환.

6. **`services.getAnalysisProgress()`**
   - 권장(B): 백엔드가 매 tick에 `{scannedImages, domainsScanning, ...}` 카운터를 SSE `data`에 함께 실어주도록 `step_payload` 확장. 동시에 동일 정보를 반환하는 `GET /api/analysis/{job_id}/progress` REST 추가 (마지막 이벤트 캐시 반환).
   - 프론트: services.js에서 fetch 폴링으로 매핑.
   - 대안(A): 프론트 AnalyzingScreen을 SSE step 진행으로 재설계 (HANDOFF.md 데이터 계약 변경).

### Phase 3 — 백엔드 신규 구현이 큰 항목

7. **인증 시스템** (`login`/`signup`/`logout`)
   - users 테이블 확장 (email PK, password_hash, name, birth, gender, ref).
   - JWT 발급/검증 미들웨어. 토큰을 받아 모든 보호 엔드포인트에서 `user_id` 결정.
   - signup 성공 시 받은 `user_id`가 face register 흐름과 자연스럽게 연결되도록 회원가입→얼굴등록 일관 플로우 정의.

8. **Deletion request / Status 추적**
   - `deletion_requests` 테이블 (`receipt_id, user_id, match_ids[], consents, memo, sent_at, legal_basis, trackable`).
   - `request_attempts` 테이블 (3-stage retry: `request_id, attempt_no, status, ts`) → frontend의 `progress: [1,1,0]`로 매핑.
   - `POST /deletion-requests`, `GET /deletion-requests?status=...` 신규.
   - 기존 `module_crawl_takedown`의 takedown 워크플로와 어떻게 연결할지 결정 (deletion_request → takedown candidates 자동 fan-out).

9. **`getDashboardSummary()`**
   - `GET /api/dashboard/summary` 신규. `monitor/stats` + Evidence count + deletion_requests count + users.last_scan_at 조회 결과를 합성.

---

## 5. 빠른 검증 체크리스트 (구현 후)

- [ ] `frontend-ui/`에서 `grep -rn "TODO(integration)" .` → 0건 (헬퍼 주석만 남기는 경우 1~2개 허용).
- [ ] `frontend-ui/screens/`에서 `grep -rn "fetch(" .` → 0건 (모든 fetch는 services.js 격리).
- [ ] `services.MOCK` import가 `WelcomeScreen`/`StatusScreen`에서 제거되었는지 확인 (HANDOFF.md §3단계).
- [ ] `getAnalysisProgress` 데모 시뮬레이션 코드(`_analysisStartTime`, `_scannedBaseline`, `CONFIG.ANALYSIS_DEMO_DURATION_MS`) 삭제 (HANDOFF.md §4단계).

---

## 6. 정리

| 카테고리 | 건수 | 함수 |
|---|---:|---|
| ✅ 바로 연결 가능 | 1 | `setAuthToken` |
| ⚠️ 어댑터로 즉시 처리 | 3 | `checkEmailDuplicate`, `startAnalysis`, `uploadFacePhoto` |
| ❌ 백엔드만 추가 필요 | 4 | `login`, `logout`, `getRequestStatus`, `getDashboardSummary` |
| ❌ 백엔드+프론트 둘 다 수정 | 4 | `signup`, `getAnalysisProgress`, `getAnalysisResults`, `submitDeletionRequest` |
| **합계** | **12*** | |

*services.js는 11개 함수지만 `signup`은 인증/등록 관점에서 두 개 카테고리에 걸쳐 있어 표 6번에서 한 번 더 등장.

**가장 무거운 단일 작업은 인증 시스템 신규 구현**이며, 이 작업이 끝나기 전에는 `user_id`가 어디서 오는지에 대한 임시 합의(예: register 결과를 그대로 사용)를 두고 Phase 1·2를 먼저 진행하는 것이 합리적이다.
