# 백엔드 통합을 위해 필요한 작업 및 논의 사항

> 📌 **이 문서의 목적**: 백엔드 팀과의 통합 회의 자료. 어떤 기능을 새로 만들어야 하는지, 어떤 결정을 함께 내려야 하는지 정리.
> 상세 기술 분석은 [INTEGRATION_PLAN.md](INTEGRATION_PLAN.md), 프론트엔드 데이터 계약은 [frontend-ui/HANDOFF.md](frontend-ui/HANDOFF.md) 참고.

---

## 📋 한눈에 보기

- **전체 통합 함수 개수**: 11개 (`services.setAuthToken`은 클라이언트 전용이라 제외)
- 🔴 **백엔드 신규 개발 필요**: 5개 — 엔드포인트 자체가 없음
- 🟡 **백엔드 수정/보강 필요**: 3개 — 비슷한 기능은 있으나 스키마/패러다임이 다름
- 🟢 **프론트엔드만 수정**: 3개 — 어댑터 작성으로 백엔드 무수정 처리 가능

> 💡 **결론 한 줄**: 어댑터 3건은 1주일 내 데모 가능. 그 다음으로 분석 결과 스키마 보강(소) → 인증/대시보드/요청추적 시스템 신규(대)의 순서가 가장 합리적.

---

## 🚨 긴급도 분류

### 🔴 [Critical] 백엔드 신규 개발 필요

#### C1. 인증 시스템 (`login` / `signup` / `logout`)

- **❓ 무엇이 없는지**
  현재 백엔드에 `email/password` 기반 인증이 통째로 없다. JWT/세션, `users` 테이블의 `email/password_hash/name/birth/gender` 컬럼, 비밀번호 해싱 정책 모두 부재. 식별자는 `user_id` 단일 문자열뿐.
- **🎯 왜 필요한지 (프론트엔드 화면 맥락)**
  - `LoginScreen.jsx`: 앱의 시작 화면. email/password 입력 폼이 이미 존재.
  - `SignupScreen.jsx`: email/password/name/birth/gender 5개 필드를 받음. 백엔드의 얼굴 등록(`/api/register`)과는 의미가 다름.
  - 이후 모든 service 호출은 `Authorization: Bearer <token>` 헤더를 자동 주입하는 패턴 (services.js의 `authHeaders()`).
- **⏱ 추정 작업 분량**: **3–5일** (가장 무거운 단일 작업)
  - users 테이블 마이그레이션, 비밀번호 해싱(bcrypt 등), JWT 발급/검증 미들웨어, 3개 엔드포인트(`/auth/login`, `/auth/signup`, `/auth/logout`).
- **🤝 결정 필요**
  - email을 `user_id`로 그대로 사용할지, 별도 PK를 둘지 (👉 회의 안건 #1).
  - signup 직후 face register 흐름과 어떻게 연결할지 (회원가입 응답의 토큰을 받아 `/api/register` 호출 시 `user_id` 자동 주입).
  - logout을 서버측 토큰 무효화로 구현할지 단순 클라이언트 토큰 폐기로 둘지.

---

#### C2. 사용자별 삭제 요청 추적 (`getRequestStatus`)

- **❓ 무엇이 없는지**
  사용자별 takedown 요청 이력 조회 + **3-stage retry 진행도** 모델 (`progress: [1,1,0]` = 1차 발송됨, 2차 재시도 발송됨, 3차 미발송)이 부재. 현재 `module_crawl_takedown`은 candidate 단위로만 운영되고 user-scoped 조회/재시도 횟수 추적이 없음.
- **🎯 왜 필요한지 (프론트엔드 화면 맥락)**
  - `StatusScreen.jsx`: 사용자가 자신의 삭제 요청 목록과 처리 상태를 보는 메인 화면.
  - 필터 탭 4개: `all` / `wait` / `done` / `review`.
  - 각 항목에 `status: '응답 대기' | '삭제 완료' | '검토 대기'`와 `progress: number[3]` 표시.
  - 상단에 전체 통계 4개(`total/wait/review/done`) 카드 표시.
- **⏱ 추정 작업 분량**: **2–3일**
  - 신규 테이블 `deletion_requests` + `request_attempts` 설계 및 마이그레이션.
  - `GET /deletion-requests?status=...` 엔드포인트 (stats + items 조합 응답).
  - `module_crawl_takedown`과의 동기화 로직 (이건 C3와 묶어서 설계).
- **🤝 결정 필요**
  - 3-stage retry 정책: 자동 재시도인지(주기/조건) vs 수동 트리거인지.
  - 기존 takedown 모듈을 그대로 두고 위에 wrapper만 얹을지, 데이터 모델을 통합할지 (👉 회의 안건 #3).

---

#### C3. 단일 삭제 요청 제출 엔드포인트 (`submitDeletionRequest`)

- **❓ 무엇이 없는지**
  프론트는 `POST /deletion-requests` 1번 호출로 `matchIds[] + consents + memo`를 한꺼번에 제출하고 영수증(`receiptId/legalBasis/sentAt/trackable`)을 받기를 기대. 현재 백엔드는 `takedown/candidate/add` → `create_from_candidate` → `mark_sent`의 다단계 흐름이고 `consents`/`memo` 컬럼도 없으며 영수증 발급 개념도 없음.
- **🎯 왜 필요한지 (프론트엔드 화면 맥락)**
  - `ReviewScreen.jsx`: 사용자가 선택한 매칭들을 확인하고 **법적 근거(정보통신망법 §44-2) 동의 + 통계 활용 동의(선택) + 자유 메모**를 입력 후 한 번에 제출.
  - `SentScreen.jsx`: 제출 직후 받은 영수증을 표시. `receiptId`(예: `RCP-2026-04-28-1422`)는 사용자가 캡처/스크린샷할 수 있는 증빙.
- **⏱ 추정 작업 분량**: **2일**
  - `deletion_requests` 테이블에 `consents JSON, memo TEXT, receipt_id TEXT, legal_basis TEXT` 컬럼 포함.
  - 단일 엔드포인트가 내부적으로 `module_crawl_takedown`의 candidate 흐름으로 fan-out하는 어댑터 로직.
  - `receiptId` 발급 규칙(서버 시간 기반).
- **🤝 결정 필요**
  - C2의 데이터 모델과 같이 설계 (한 번에 묶어서 진행 권장).

---

#### C4. 대시보드 집계 (`getDashboardSummary`)

- **❓ 무엇이 없는지**
  `totalIndexed/matchesFound/processed/lastScan/averageDuration/scanScope` 6개 필드를 한 번에 반환하는 엔드포인트가 없음. `/api/monitor/stats` + Evidence DB count 등으로 합성은 가능하지만 프론트가 N개 호출을 해야 함.
- **🎯 왜 필요한지 (프론트엔드 화면 맥락)**
  - `WelcomeScreen.jsx`: 로그인 직후의 메인 대시보드. "지난번 분석 3일 전, 평균 8분 소요, 누적 17건 매칭" 같은 누적 통계를 보여주는 환영 카드.
- **⏱ 추정 작업 분량**: **1일**
  - `GET /api/dashboard/summary` 신규. 내부에서 `monitor/stats`, Evidence count, deletion_requests count, users 테이블의 `last_scan_at`을 합성.
- **🤝 결정 필요**
  - `lastScan`/`averageDuration` 같은 human-readable 문자열을 서버에서 만들어 보낼지(예: "3일 전"), 타임스탬프만 보내고 프론트가 포맷팅할지 (👉 회의 안건 #5).

---

### 🟡 [High] 백엔드 수정/보강 필요

#### H1. 분석 진행률 통신 (`getAnalysisProgress`)

- **❓ 무엇이 없는지 (혹은 다른지)**
  백엔드는 SSE 스트림(`GET /api/stream/{job_id}`)으로 step 단위 이벤트(`step/status/message/data/ts`)를 발행. 프론트는 1초마다 REST 폴링으로 `{scannedImages, domainsScanning, secondsRemaining, done}` 같은 누적 카운터를 받기를 기대. **데이터의 종류와 통신 패러다임이 모두 다름.**
- **🎯 왜 필요한지 (프론트엔드 화면 맥락)**
  - `AnalyzingScreen.jsx`: 분석 중 화면. 큰 숫자로 "스캔된 이미지 N개", "도메인 M개 진행 중", "남은 시간 S초"를 보여주는 카운터 UI + ScannerOrb 애니메이션.
  - 1초 폴링 가정으로 매끄러운 카운터 증가 효과를 노림.
- **⏱ 추정 작업 분량**: **1–2일** (옵션에 따라)
  - 옵션 B 채택 시: `step_payload`에 누적 카운터 필드 추가 + REST `/api/analysis/{job_id}/progress` 캐시 엔드포인트 신설.
- **🤝 결정 필요** 👉 **회의 안건 #2**
  - SSE로 통일할지(프론트 큰 변경) vs REST polling으로 통일할지(백엔드 보강).

---

#### H2. 분석 결과 조회 + Evidence 스키마 확장 (`getAnalysisResults`)

- **❓ 무엇이 없는지**
  파이프라인이 결과를 Evidence DB에 적재하지만,
  1. `job_id`/`user_id`로 필터하는 쿼리가 없어 **전체 evidence가 모든 사용자에게 노출**됨.
  2. 프론트 `Match` 타입의 `domain/date/time/similarity/note` 필드가 Evidence 테이블에 **없음** (현재 `id, image_url, is_deepfake, is_deleted`만 존재).
- **🎯 왜 필요한지 (프론트엔드 화면 맥락)**
  - `ResultsScreen.jsx`: 분석 완료 후 매칭된 이미지 목록을 보여주는 화면. 각 행에 도메인명, 발견 일시, 유사도(96%, 91% 등), context label("익명 호스팅 · 컨텍스트 미상" 등) 표시. 사용자가 체크박스로 선택해서 다음 단계(ReviewScreen)로 넘김.
- **⏱ 추정 작업 분량**: **1–2일**
  - Evidence 테이블에 `domain TEXT, captured_at TEXT, similarity REAL, note TEXT, user_id TEXT, job_id TEXT` 컬럼 추가 마이그레이션.
  - `pip/orchestrator.py`의 `run_pipeline_from_crawl`에서 INSERT 시점에 위 필드 채우기 (대부분 이미 변수로 보유 중: `m["crawling"]`에서 도메인 파싱, 매칭 시점, `sim` 값).
  - `GET /evidence/api/evidence?user_id=...&job_id=...` 필터 지원.
- **🤝 결정 필요**
  - Evidence 테이블을 확장할지 vs 별도 `analysis_results` 테이블을 신설할지 (👉 회의 안건 #4).

---

#### H3. 단일 얼굴 사진 업로드 의미 정리 (`uploadFacePhoto`)

> ⚠️ 이 항목은 **프론트 어댑터로 대부분 해결되지만**, "현재 `/api/register`가 5장 일괄 수신만 가능"하다는 백엔드의 제약이 어댑터 설계의 형태를 강제하므로 회의에서 합의가 필요. 작업 자체는 백엔드 무수정으로 진행 가능.

- **❓ 무엇이 다른지**
  프론트는 슬롯별로 1장씩 업로드(`uploadFacePhoto(angleKey, blob)`)를 가정. 백엔드의 `/api/register`는 5장을 한 번에 받음.
- **🎯 왜 필요한지**
  - `CaptureScreen.jsx`: 5각도(L90/L45/F0/R45/R90) 슬롯을 하나씩 채우는 UI. 각 슬롯 캡처 시 즉시 검증 피드백을 주고 싶음.
- **🛠 권장 처리 방향**
  - 어댑터에서 호출 시점에는 `POST /api/validate_pose`로 실시간 검증만 하고 5장의 dataUrl을 클라이언트에 캐시.
  - capture 흐름 마지막에 `services.commitFaceRegistration()`(services.js에 신설) → `POST /api/register`로 일괄 제출.
- **⏱ 추정 작업 분량**: 백엔드 **0일** (무수정), 프론트 **0.5일**.
- **🤝 결정 필요**
  - 백엔드에 슬롯 개별 업로드 엔드포인트 `POST /api/face-photos`를 추가할지 여부 (현재로선 불필요. 어댑터로 충분).

---

### 🟢 [Low] 어댑터로 해결 가능 (프론트만 수정)

| ID | 함수 | 매핑 | 비고 |
|---|---|---|---|
| L1 | `checkEmailDuplicate(email)` | `GET /api/check_user_id?id=${email}` | 운영상 user_id에 email 문자열을 그대로 사용한다는 합의가 있으면 백엔드 무수정. 회의 안건 #1과 연결. |
| L2 | `startAnalysis()` | `POST /api/start-from-crawl` body `{user_id}` → 응답 `{job_id}`를 `{analysisId: job_id}`로 키 리네임 | `user_id`는 AuthContext가 보유한 식별자에서 주입. 인증 시스템 도입 전에는 register 결과의 user_id 사용. |
| L3 | `uploadFacePhoto` | `POST /api/validate_pose` + 마지막에 `POST /api/register` 일괄 | H3 참고. |

> ✅ **이 3건은 백엔드 무수정으로 Sprint 1에서 처리 가능.**

---

## 🤔 팀 회의에서 결정해야 할 사항

### 1️⃣ 인증 시스템: email/password 추가 vs `user_id` 단일 식별 유지?

- **옵션 A — 백엔드에 email/password 인증 신규 추가**
  - 👍 장점: 프론트의 LoginScreen/SignupScreen이 그대로 동작. 표준적인 SaaS 패턴. 다중 사용자/세션 관리가 명확. 비밀번호 분실 등 일반적 UX 흐름 지원 가능.
  - 👎 단점: 백엔드 작업량 가장 큼(3–5일). users 테이블 확장, 비밀번호 해싱, JWT 미들웨어 등 인프라 추가.
- **옵션 B — 프론트가 `user_id` 단일 입력으로 양보**
  - 👍 장점: 백엔드 무수정. 즉시 통합 가능.
  - 👎 단점: LoginScreen/SignupScreen UI를 대대적으로 재설계해야 함. HANDOFF.md의 데이터 계약과 어긋남. 현재 백엔드는 비밀번호 검증 자체가 없어서 **사실상 인증 없이 user_id만 알면 누구나 접근 가능** → 보안상 부적절.
- **🎯 추천: 옵션 A** — 보안 측면에서 옵션 B는 PoC/데모용은 가능해도 실서비스에서 부적절. Sprint 3에서 정식 구현.

### 2️⃣ 분석 진행 통신: SSE로 통일 vs REST polling으로 통일?

- **옵션 A — 프론트를 SSE(EventSource) 기반으로 변경**
  - 👍 장점: 백엔드 무수정. 실시간성 우수. 네트워크 효율(폴링 N회 절감).
  - 👎 단점: AnalyzingScreen UI를 step 진행 표시로 재설계해야 함. HANDOFF.md의 `AnalysisProgress` 데이터 계약(누적 카운터 형태) 변경. 모바일/프록시 환경에서 SSE 끊김 처리 추가 코딩 필요.
- **옵션 B — 백엔드가 누적 카운터를 emit + REST polling 엔드포인트 추가**
  - 👍 장점: HANDOFF.md 데이터 계약 보존. 프론트 UI 무수정. AnalyzingScreen의 큰 숫자 카운터/ScannerOrb 같은 시각 효과를 그대로 살림.
  - 👎 단점: 백엔드 1–2일 추가 작업. 1초 폴링이 N명 동접 시 부하로 작용 가능.
- **🎯 추천: 옵션 B** — 프론트가 의도한 UX(큰 숫자 카운터)를 보존하면서 백엔드 작업량도 적당. 단, 동접이 100명 이상 예상되면 옵션 A 재검토.

### 3️⃣ 삭제 요청 추적: 신규 테이블 신설 vs 기존 takedown 모듈 확장?

- **옵션 A — `deletion_requests` + `request_attempts` 신규 테이블, 기존 takedown 모듈은 fan-out 대상으로**
  - 👍 장점: user-scoped 조회/3-stage retry 모델이 깔끔. 프론트 `StatusOverview` 타입과 1:1 매핑.
  - 👎 단점: 기존 `module_crawl_takedown`의 candidates와 데이터 동기화 로직 필요(중복 가능성).
- **옵션 B — 기존 takedown 모듈에 `user_id`, `attempt_count`, `consents`, `memo` 컬럼만 추가**
  - 👍 장점: 단일 진실 소스(single source of truth). 동기화 부담 없음.
  - 👎 단점: takedown 모듈의 기존 candidate 흐름과 사용자 요청 모델이 섞여 스키마가 복잡해짐.
- **🎯 추천: 옵션 A** — 프론트의 데이터 모델이 명확히 user 중심이고, takedown 모듈은 워크플로 엔진으로 두고 사용자 요청은 별도 추적이 장기적으로 유지보수가 쉬움.

### 4️⃣ Evidence 스키마: 기존 테이블 확장 vs `analysis_results` 별도 테이블?

- **옵션 A — Evidence 테이블에 컬럼 추가**
  - 👍 장점: 마이그레이션 1회로 끝. 파이프라인 INSERT 로직 변경 최소.
  - 👎 단점: Evidence Collection Module의 다른 용도(기존 `is_deepfake/is_deleted` 단순 모델)와 의미가 섞일 수 있음.
- **옵션 B — `analysis_results` 별도 테이블 신설, Evidence는 단순 카탈로그로 유지**
  - 👍 장점: 관심사 분리. 분석 결과는 job_id별 라이프사이클이 있으나 Evidence는 영구 보관 성격.
  - 👎 단점: 테이블 1개 추가 + 두 테이블 join 필요.
- **🎯 추천: 옵션 A (단기) → 옵션 B (장기)** — Sprint 2에서는 빠르게 컬럼 추가로 처리하고, 데이터 양이 늘어나는 시점에 분리 리팩토링.

### 5️⃣ 응답 포맷팅: 서버측 human-readable 문자열 vs 프론트 포맷팅?

- **옵션 A — 서버가 "3일 전", "≈8min" 같은 사람용 문자열 직접 반환**
  - 👍 장점: 프론트 단순. 다국어 시 서버 한 곳에서 관리.
  - 👎 단점: 시간이 흘러도 응답 캐싱이 어색함. 다국어 시 서버에 i18n 추가 필요.
- **옵션 B — 서버는 ISO 타임스탬프/숫자만, 프론트가 포맷팅**
  - 👍 장점: 캐싱 친화적. 클라이언트 시간대 자동 반영.
  - 👎 단점: 프론트에 포맷팅 유틸 추가. 다국어 대응 시 프론트에서 처리.
- **🎯 추천: 옵션 B** — 일반적 SPA 패턴. `frontend-ui/shared/utils.js`에 이미 `fmt*` 헬퍼들이 있어 추가 부담 적음.

---

## 📅 권장 작업 순서

### 🏃 Sprint 1 — 빠른 데모 (목표: 1주일 내 얼굴 등록 → 분석 시작 흐름 동작)

**백엔드 작업: 0일** (옵션에 따라 회의 안건 #1 결과 반영해 user_id alias 1줄만 추가 가능)
**프론트엔드 작업: 1.5일**

- [ ] L1. `checkEmailDuplicate` 어댑터
- [ ] L2. `startAnalysis` 어댑터
- [ ] L3. `uploadFacePhoto` 어댑터 + `commitFaceRegistration()` 신규
- [ ] `services.setAuthToken`은 그대로 (인증 도입 전이라 토큰이 dummy여도 동작)

> 🎯 **마일스톤**: register → 분석 시작까지의 골격 흐름이 mock 없이 실제 백엔드와 통신.

### 🛠 Sprint 2 — 백엔드 소규모 보강 (목표: 분석 결과 화면까지 실제 데이터)

**백엔드 작업: 2–3일**
**프론트엔드 작업: 1일**

- [ ] H2. Evidence 테이블 컬럼 확장 + `job_id`/`user_id` 필터
- [ ] H1. SSE에 누적 카운터 추가 + REST `/api/analysis/{job_id}/progress` 신설 (회의 안건 #2 옵션 B 채택 시)
- [ ] 프론트 `getAnalysisResults` / `getAnalysisProgress` 어댑터

> 🎯 **마일스톤**: AnalyzingScreen → ResultsScreen까지 실제 데이터로 동작.

### 🏗 Sprint 3 — 백엔드 신규 개발 (목표: 풀 인증 + 사용자 요청 관리)

**백엔드 작업: 7–10일**
**프론트엔드 작업: 0.5일** (어댑터 마무리만)

- [ ] C1. 인증 시스템 (login/signup/logout) — **3–5일**
- [ ] C2 + C3. `deletion_requests` / `request_attempts` 테이블 + 단일 제출 + 상태 조회 — **4일** (묶어서)
- [ ] C4. `getDashboardSummary` 집계 엔드포인트 — **1일**

> 🎯 **마일스톤**: 모든 services.js 함수가 mock 없이 실서버와 통신. HANDOFF.md의 §3(MOCK 삭제), §4(데모 시뮬레이션 코드 제거) 작업 가능.

---

## 📎 참고 문서

- 📊 **상세 기술 분석**: [INTEGRATION_PLAN.md](INTEGRATION_PLAN.md) — 매핑 테이블 12행, 데이터 계약, Phase별 구체적 변경 사항.
- 📘 **프론트엔드 통합 가이드**: [frontend-ui/HANDOFF.md](frontend-ui/HANDOFF.md) — services.js의 12개 `TODO(integration)` 위치, JSDoc 데이터 타입, 에러 처리 규약(`ApiError`/`fieldErrors`).
- 🔍 **백엔드 게이트웨이**: [pip/orchestrator.py](pip/orchestrator.py) — 현재 모든 엔드포인트의 단일 조립 지점.

---

## 📨 회의 전 체크리스트

회의 진행자가 사전에 결정/공유할 것들:

- [ ] 회의 안건 #1 (인증 방식) — 추천 옵션 A로 진행 가능한지 백엔드 팀 캐파 확인
- [ ] 회의 안건 #2 (SSE vs polling) — 예상 동접 규모 공유
- [ ] 회의 안건 #3 (요청 추적 데이터 모델) — 기존 takedown 모듈 담당자 회의 참석 필수
- [ ] 회의 안건 #4 (Evidence 스키마) — Evidence Collection Module 담당자 의견 필요
- [ ] 회의 안건 #5 (포맷팅 위치) — 다국어 지원 계획 여부 확인
