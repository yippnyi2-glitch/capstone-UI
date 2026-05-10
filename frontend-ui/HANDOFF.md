# Face Deletion Request Service — Frontend

비동의 딥페이크 사진 탐지 및 삭제 요청 서비스의 프론트엔드입니다.
백엔드 통합 담당자를 위한 가이드입니다.

---

## 30초 요약

이 프로젝트는 **모듈러 React 프로토타입** 입니다. 22개 파일의 `src/` 트리로
구성돼 있고, **모든 백엔드 호출이 한 파일(`src/services.js`)에 모여 있습니다.**

**통합 작업의 99%는 한 가지입니다:**
`src/services.js` 안 `services` 객체의 10개 함수 본문에서
`await sleep(...)` + 가짜 데이터 반환을 → **실제 `fetch()` 호출**로 바꾸기.

화면 컴포넌트(9개)는 거의 손댈 일이 없습니다.

---

## 파일 구조 (22 파일)

```
src/
├── App.jsx                       ── 진입점 (라우터 + 프로바이더 + DevPager)
├── config.js                     ── 환경 설정 (API_BASE_URL 등)
├── services.js                   ◀ 백엔드 통합의 거의 전부가 여기
│                                    (services 객체 + MOCK + ApiError + JSDoc 타입)
│
├── styles/
│   └── tokens.js                 ── T 색상, FONT_*, grainBg, useFonts
│
├── assets/
│   └── faceRefs.js               ── 5각도 얼굴 가이드 이미지 (base64 인라인)
│
├── shared/                       ── 재사용 가능한 빌딩블록
│   ├── utils.js                    · sleep, fmt, fmtReceipt*, pwdStrength,
│   │                                 isEmailValid, isBirthValid, formatPhone
│   ├── icons.jsx                   · 라인아트 아이콘 (Mail/Lock/User/Cal/Eye/Check 등)
│   ├── layout.jsx                  · Bracket, TopLabel
│   ├── cta.jsx                     · CtaPrimary, CtaGhost, TextLink
│   ├── form.jsx                    · FieldLabel, BareInput, IconField, GroupHeader,
│   │                                 Badge, PwdStrengthBar, SegmentedControl, Checkbox
│   └── misc.jsx                    · UserBadge, BlurredThumb
│
├── context/
│   ├── AuthContext.jsx           ── 로그인 상태, 토큰 자동 주입 (localStorage 영속화)
│   └── ToastContext.jsx          ── 에러/성공 알림 (우상단 토스트, 4초 자동 해제)
│
└── screens/                      ── 9개 화면 (각각 default export)
    ├── LoginScreen.jsx
    ├── SignupScreen.jsx
    ├── CaptureScreen.jsx         (+ HeadSilhouette, AngleSlot, CornerTicks)
    ├── WelcomeScreen.jsx
    ├── AnalyzingScreen.jsx       (+ ScannerOrb)
    ├── ResultsScreen.jsx         (+ ResultRow)
    ├── ReviewScreen.jsx          (+ ConsentItem)
    ├── SentScreen.jsx
    └── StatusScreen.jsx          (+ StatusStat, StatusRow, ProgressDots)
```

---

## 진입점 — bundler 환경에 마운트

본인의 bundler(Vite/CRA/Next 등)에 맞는 진입점에서:

```jsx
// 예: Vite의 main.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./src/App";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

CRA, Next.js 등 다른 환경도 패턴 동일 (`import App from "./src/App"`).
`package.json` / `vite.config.js` / `index.html` 등 빌드 진입점은
환경마다 다르므로 의도적으로 포함하지 않았습니다.

---

## 통합 절차 (4단계)

### 1단계 — 환경 설정 적용

`src/config.js`의 `API_BASE_URL`을 본인 환경에 맞게:

```js
export const CONFIG = {
  API_BASE_URL: process.env.REACT_APP_API_BASE_URL || "/api",
  AUTH_STORAGE_KEY: "fdr_auth_v1",
  ANALYSIS_DEMO_DURATION_MS: 12000, // 통합 후 삭제 가능
};
```

### 2단계 — `src/services.js`의 각 함수 본문을 `fetch()`로 교체

각 함수 위에 `// TODO(integration): ...` 주석으로 호출 방법이 적혀 있습니다.
예시 (login):

```js
// 변경 전 (mock)
async login(email, password) {
  await sleep(400);
  const result = { token: "mock-...", user: {...} };
  _authToken = result.token;
  return result;
}

// 변경 후 (real)
async login(email, password) {
  const res = await fetch(`${CONFIG.API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(err.message || "로그인 실패", err.code, err.fieldErrors);
  }
  const result = await res.json();
  _authToken = result.token;
  return result;
}
```

**인증 헤더는 `authHeaders()` 헬퍼를 사용:**

```js
async getDashboardSummary() {
  const res = await fetch(`${CONFIG.API_BASE_URL}/dashboard/summary`, {
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new ApiError("...", res.status);
  return res.json();
}
```

### 3단계 — `MOCK` 객체 삭제

`src/services.js` 상단의 `MOCK = { user, matches, statusLog }` 블록은
통합이 끝나면 통째로 삭제. 화면의 fallback 참조도 함께 정리:

```jsx
// WelcomeScreen.jsx, StatusScreen.jsx
// 변경 전
const user = auth.user || MOCK.user;

// 변경 후
const user = auth.user; // null guard는 라우팅 단에서
```

해당 import 문도 정리:

```jsx
// 변경 전
import { services, MOCK } from "../services";

// 변경 후
import { services } from "../services";
```

### 4단계 — 분석 데모 로직 제거

`src/services.js`의 `getAnalysisProgress`에서 `_analysisStartTime`,
`_scannedBaseline`, `CONFIG.ANALYSIS_DEMO_DURATION_MS`는 데모 전용입니다.
실제 백엔드는 서버 시간 기준으로 `done`을 반환하므로 클라이언트 시뮬레이션
코드는 모두 삭제.

---

## 데이터 계약 (JSDoc 타입)

`src/services.js` 상단에 모든 데이터 형태가 JSDoc으로 명세돼 있습니다.
백엔드 응답이 다르면 두 가지 옵션:

1. **백엔드 응답을 JSDoc 타입에 맞춤** (추천)
2. **service 함수 내부에 어댑터 추가** — 응답 받자마자 변환

주요 타입:

| 타입 | 사용 |
|---|---|
| `User` | 로그인 사용자 정보 |
| `AuthResult` | 로그인/회원가입 응답 |
| `Match` | 탐지된 유사 이미지 |
| `AnalysisProgress` | 분석 진행 상황 (폴링) |
| `RequestReceipt` | 삭제 요청 영수증 |
| `StatusItem` / `StatusOverview` | 처리 현황 |
| `DashboardSummary` | 환영 화면 요약 |
| `ConsentFlags` | 동의 (delivery 필수 + statistics 선택) |

---

## 에러 처리

### 모든 service 함수는 `ApiError`를 throw

```js
import { ApiError } from "./services";

class ApiError extends Error {
  constructor(message, code, fieldErrors) { ... }
  // .message, .code, .fieldErrors
}
```

### 사용 예시 — 토스트 (전역 에러)

```jsx
import { useToast } from "../context/ToastContext";
import { ApiError, services } from "../services";

const toast = useToast();
try {
  await services.startAnalysis();
} catch (e) {
  toast.error(e instanceof ApiError ? e.message : "분석을 시작할 수 없습니다");
}
```

### 사용 예시 — 필드 에러 (폼 인라인)

```jsx
try {
  await auth.signup(profile);
} catch (e) {
  if (e instanceof ApiError && e.fieldErrors?.email) {
    setEmailError(e.fieldErrors.email);
  } else {
    toast.error(e.message);
  }
}
```

### 백엔드가 던져야 할 에러 형태

```json
{
  "message": "검증 실패",
  "code": "VALIDATION",
  "fieldErrors": {
    "email": "이미 사용 중인 이메일입니다",
    "password": "비밀번호가 너무 짧습니다"
  }
}
```

---

## 인증 흐름

1. 사용자가 LoginScreen에서 로그인 → `auth.login(email, pwd)` 호출
2. AuthProvider가 내부적으로 `services.login()` 실행
3. 받은 토큰을 React state + `localStorage` (try/catch 보호) 에 저장
4. `services.setAuthToken(token)` 호출 → 모듈 레벨 `_authToken` 업데이트
5. 이후 모든 service 함수의 `fetch()`는 `authHeaders()` 헬퍼로 토큰 자동 주입
6. 페이지 새로고침 시 AuthProvider mount에서 localStorage 복원

**컴포넌트는 `useAuth()` 훅으로 user/token 접근, fetch 헤더는 자동.**

---

## 자산 (`src/assets/faceRefs.js`)

5각도 (좌 90°/45°, 정면, 우 45°/90°) 얼굴 참조 이미지를 base64 데이터 URI로
인라인 보관합니다. 사용자 제공 무료 라이선스 일러스트를 잘라 만든 것으로,
학술/비영리 대학 프로젝트 컨텍스트입니다.

**프로덕션 권장**: 데이터 URI를 떼고 `/public/face-refs/{KEY}.png` 같은
정적 자산 경로로 옮기세요. `FACE_REFS` 객체의 인터페이스만 유지하면
컴포넌트는 한 줄도 안 바꿔도 됩니다.

```js
// 변경 후
export const FACE_REFS = {
  L90: "/face-refs/L90.png",
  L45: "/face-refs/L45.png",
  F0:  "/face-refs/F0.png",
  R45: "/face-refs/R45.png",
  R90: "/face-refs/R90.png",
};
```

번들 크기 감소 + 브라우저 캐시 효율 향상.

---

## 미해결 / 향후 개선 사항

| 항목 | 현재 상태 | 비고 |
|---|---|---|
| 401 응답 시 자동 로그아웃 | 미구현 | services.js fetch 래퍼에 인터셉터 추가 권장 |
| 요청 cancellation (AbortController) | 부분 구현 | `cancelled` 플래그만 있음 |
| Retry 로직 | 없음 | 네트워크 에러 시 재시도 미구현 |
| Offline 감지 배너 | 없음 | `navigator.onLine` 기반 추가 가능 |
| 접근성 (ARIA) | 부분 적용 | 폼 라벨/포커스 관리 추가 필요 |

---

## 디자인 시스템 (참고)

| 카테고리 | 토큰 |
|---|---|
| 배경 | `T.bg` `#F4EEDC` (웜 베이지) |
| 페이퍼 | `T.paper` `#FAF5E5` |
| 텍스트 | `T.ink` `#1B1812` |
| 액센트 | `T.green` `#1E4534` (다크 그린) |
| 경고 | `T.warn` `#A14A2A` |
| 폰트 | `FONT_SERIF` (Nanum Myeongjo / Noto Serif KR), `FONT_SANS` (Pretendard / Noto Sans KR), `FONT_MONO` (JetBrains Mono) |

모두 `src/styles/tokens.js`에서 export.

---

## DevPager (개발 보조)

화면 우하단의 작은 9개 버튼 (`01`~`09`)은 개발용 화면 점프 도구입니다.
**프로덕션 빌드에서는 `src/App.jsx`의 `<DevPager />` 호출 한 줄만 제거**하면
되고, 같은 파일 하단의 `function DevPager` 정의도 함께 지우면 깔끔.

---

## 빠르게 검증하는 법

```bash
grep -rn "TODO(integration)" src/
```

→ `services.js` 안 12곳의 통합 포인트가 한 번에 보입니다. 모든 fetch 작업을
마쳤으면 이 검색이 0건이 되어야 합니다 (인증 헬퍼 관련 한두 개는 정보성
주석으로 남겨도 무방).

```bash
# 화면 컴포넌트 안에 fetch 직접 호출이 남아있지 않은지 확인
grep -rn "fetch(" src/screens/
```

→ 0건이 정상 (모든 fetch는 services.js에 격리).

---

## 문의

UI/UX 관련 질문은 프론트엔드 작성자에게,
백엔드 응답 형태 / 에러 코드 정의는 별도 API 문서 참조.
