import { CONFIG } from "./config";
import { sleep, fmtReceiptId, fmtReceiptTime } from "./shared/utils";

export class ApiError extends Error {
  /**
   * @param {string} message              Human-readable message
   * @param {string} [code='unknown']     Machine-readable code, e.g. 'EMAIL_TAKEN'
   * @param {Object<string,string>} [fieldErrors]  Field-level errors,
   *                                      e.g. { email: "이미 사용 중인 이메일입니다" }
   */
  constructor(message, code = "unknown", fieldErrors = null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

/* ============================================================================
   BACKEND SERVICE LAYER — MOCK IMPLEMENTATION
   ----------------------------------------------------------------------------
   This is the SINGLE source of all data flowing into the UI.
   All components consume data via `services.xxx()` calls.

   ▶ Integrator: replace the body of each function below with a real fetch().
     The UI components do NOT need to be modified.
     Response shapes are documented via JSDoc above each function — backend
     should match these shapes, or wrap response in an adapter here.

   ▶ Mock data lives in MOCK at the top. In production this object disappears;
     only the JSDoc types and the function signatures remain.
   ============================================================================ */

/* ---------- Auth token (module-level state shared by all services) ---------- */
// The token is held here so every service call can read it without explicit
// passing. It is set by AuthProvider via services.setAuthToken() on login,
// cleared on logout. The integrator only needs to use authHeaders() inside
// each fetch() call.
let _authToken = null;

const authHeaders = () =>
  _authToken ? { Authorization: `Bearer ${_authToken}` } : {};

/* ---------- Backend identity & face-photo buffer (Phase 1 adapter state) ----------
   백엔드(orchestrator.py)에는 인증/계정 시스템이 없고 식별자가 user_id 문자열 하나뿐이다.
   uploadFacePhoto / startAnalysis 시그니처에는 user_id가 없으므로, 회원가입 흐름에서
   항상 먼저 호출되는 checkEmailDuplicate(email)가 통과하는 순간 그 email을 _userId 로
   잡아두고 이후 register / start-from-crawl 에서 재사용한다.
   ("user_id == email" 운영 합의를 코드로 구현하는 셈.)
   DevPager 등으로 회원가입을 건너뛴 경우엔 1회성 임시 id를 만든다(백엔드도 user_id
   미발견 시 가장 최근 등록 유저로 폴백함). 인증 시스템 도입 시(Phase 2) 정리 대상. */
let _userId = null;
const resolveUserId = () => {
  if (!_userId) _userId = "web-" + Date.now();
  return _userId;
};

/* uploadFacePhoto는 각도별로 1장씩(5회) 호출되지만 백엔드 POST /api/register 는 5장을
   한 번에 받는다. 모인 사진(data URL)을 여기에 버퍼링했다가 5장이 다 차면 일괄 전송한다.
   FACE_KEY_MAP: 프론트 각도키 → 백엔드 이미지 키. */
const FACE_KEY_MAP = { L90: "left90", L45: "left45", F0: "front", R45: "right45", R90: "right90" };
let _faceBuffer = {}; // { front, left45, right45, left90, right90 } → data URL string

/* ---------- Analysis run state (mock only — delete in production) ---------- */
let _analysisStartTime = 0;
let _scannedBaseline = 2847321;

/* ---------- JSDoc type definitions (data contract) ---------- */

/**
 * @typedef {Object} User
 * @property {string} id        Internal user ID
 * @property {string} email     Login email
 * @property {string} name      Display name (e.g. "홍길동")
 * @property {string} ref       Public reference code (e.g. "REF-2026-04-12")
 */

/**
 * @typedef {Object} AuthResult
 * @property {string} token     JWT or session token
 * @property {User}   user
 */

/**
 * @typedef {Object} SignupProfile
 * @property {string} email
 * @property {string} password
 * @property {string} name
 * @property {string} birth     YYYYMMDD (8 digits)
 * @property {'m'|'f'|'x'} gender
 */

/**
 * @typedef {Object} Match
 * @property {string} id
 * @property {string} domain     Host domain where the image was found
 * @property {string} date       "YYYY.MM.DD"
 * @property {string} time       "HH:MM"
 * @property {number} similarity 0–100 similarity score
 * @property {string} note       Short context label
 * @property {string} [thumbUrl] Blurred thumbnail URL (omitted in mock)
 */

/**
 * @typedef {Object} AnalysisProgress
 * @property {number}  scannedImages     Live counter of scanned images
 * @property {number}  domainsScanning   Domains currently being crawled
 * @property {number}  secondsRemaining  ETA in seconds
 * @property {boolean} done              True when analysis finished
 */

/**
 * @typedef {Object} DashboardSummary
 * @property {User}   user
 * @property {number} totalIndexed       Cumulative indexed images
 * @property {number} matchesFound       Total matches found ever
 * @property {number} processed          Total deletions completed
 * @property {string} lastScan           Human-readable, e.g. "3일 전"
 * @property {string} averageDuration    Human-readable, e.g. "≈8min"
 * @property {string} scanScope          Scope label, e.g. "전 영역"
 */

/**
 * @typedef {Object} ConsentFlags
 * @property {boolean} delivery   삭제 요청 발송 동의 (필수)
 * @property {boolean} statistics 익명 통계 활용 동의 (선택)
 */

/**
 * @typedef {Object} RequestReceipt
 * @property {string}  receiptId      "RCP-YYYY-MM-DD-HHMM"
 * @property {number}  count          Number of items submitted
 * @property {string}  legalBasis     e.g. "정보통신망법 §44-2"
 * @property {string}  sentAt         "YYYY.MM.DD HH:MM:SS"
 * @property {boolean} trackable      Whether status can be tracked
 */

/**
 * @typedef {Object} StatusItem
 * @property {string}    id           Public ID, e.g. "#8472"
 * @property {string}    domain
 * @property {string}    when         e.g. "발송 · 2026.04.28 14:22"
 * @property {string}    status       Display label: "응답 대기" | "삭제 완료" | "검토 대기"
 * @property {'wait'|'done'|'review'} statusKind
 * @property {number[]}  progress     3-stage retry pipeline (initial + 2 retries),
 *                                    e.g. [1,0,0] = first attempt sent
 */

/**
 * @typedef {Object} StatusOverview
 * @property {{ total: number, wait: number, review: number, done: number }} stats
 * @property {StatusItem[]} items
 */

/* ---------- Mock data (DELETE in production) ---------- */
export const MOCK = {
  user: { id: "u-001", email: "demo@example.com", name: "홍길동", ref: "REF-2026-04-12" },

  /** @type {Match[]} */
  matches: [
    { id: "m1", domain: "unknown-host-12.net",  date: "2026.04.27", time: "14:22", similarity: 96, note: "익명 호스팅 · 컨텍스트 미상" },
    { id: "m2", domain: "socialfeed-mirror.io", date: "2026.04.27", time: "11:08", similarity: 91, note: "소셜 피드 미러 · 자동 수집" },
    { id: "m3", domain: "forum-archive-7.com",  date: "2026.04.26", time: "19:51", similarity: 88, note: "포럼 아카이브 · 캐시 페이지" },
    { id: "m4", domain: "aggregator-domain.xyz",date: "2026.04.25", time: "08:12", similarity: 84, note: "어그리게이터 도메인 · 검토 필요" },
  ],

  /** @type {StatusItem[]} */
  statusLog: [
    // 응답 대기 — 진행 중 (1차 시도, 응답 대기)
    { id: "#8472", domain: "unknown-host-12.net",   when: "발송 · 2026.04.28 14:22",      status: "응답 대기", statusKind: "wait",   progress: [1,0,0] },
    // 응답 대기 — 진행 중 (1차 미응답 → 2차 재발송, 응답 대기)
    { id: "#8471", domain: "socialfeed-mirror.io",  when: "재발송 · 2026.04.29 09:14",    status: "응답 대기", statusKind: "wait",   progress: [1,1,0] },
    // 삭제 완료 — 종료 (1차 시도에서 삭제 확인, 프로세스 100% 종료)
    { id: "#8468", domain: "forum-archive-7.com",   when: "삭제 확인 · 2026.04.27 03:44", status: "삭제 완료", statusKind: "done",   progress: [1,1,1] },
    // 삭제 완료 — 종료 (2차 시도에서 삭제 확인, 프로세스 100% 종료)
    { id: "#8463", domain: "aggregator-domain.xyz", when: "삭제 확인 · 2026.04.26 11:18", status: "삭제 완료", statusKind: "done",   progress: [1,1,1] },
    // 검토 대기 — 종료 (3차 시도까지 무응답, 재시도 한도 도달)
    { id: "#8455", domain: "image-board-3.net",     when: "재시도 한도 도달 · 2026.04.25", status: "검토 대기", statusKind: "review", progress: [1,1,1] },
  ],
};

/* ---------- Service functions (REPLACE INTERNALS WITH fetch()) ---------- */

export const services = {
  /**
   * Set or clear the bearer token used by all subsequent service calls.
   * Called by AuthProvider on login/logout/restore.
   *
   * @param {string|null} token
   */
  setAuthToken(token) {
    _authToken = token;
  },

  /**
   * Authenticate an existing user.
   *
   * POST /api/auth/login → { token, user }. 실패 시 백엔드가 { message, code, fieldErrors }
   * 를 주므로 그대로 ApiError 로 변환. 성공 시 토큰을 모듈 상태에 저장(이후 fetch 의
   * authHeaders() 가 자동 사용).
   *
   * @param {string} email
   * @param {string} password
   * @returns {Promise<AuthResult>}
   * @throws {ApiError} when credentials are invalid
   */
  async login(email, password) {
    let res;
    try {
      res = await fetch(`${CONFIG.API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw new ApiError("로그인할 수 없습니다 (네트워크 오류)", "NETWORK");
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiError(body.message || "로그인에 실패했습니다", body.code, body.fieldErrors);
    }
    _authToken = body.token || null;
    return body; // { token, user }
  },

  /**
   * Create a new account.
   *
   * POST /api/auth/signup (body: { email, password, name, birth, gender }) → { token, user }.
   * 검증 실패는 백엔드가 { message, code:'VALIDATION', fieldErrors } 로, 이메일 중복은
   * code:'EMAIL_TAKEN' (+ fieldErrors.email) 로 응답 → ApiError 로 변환. (Phase 1 의
   * checkEmailDuplicate 가 잡아둔 _userId(=email) 와 동일 식별자로 가입됨.)
   *
   * @param {SignupProfile} profile
   * @returns {Promise<AuthResult>}
   * @throws {ApiError} when validation fails (with fieldErrors) or email is taken
   */
  async signup(profile) {
    let res;
    try {
      res = await fetch(`${CONFIG.API_BASE_URL}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
    } catch {
      throw new ApiError("회원가입할 수 없습니다 (네트워크 오류)", "NETWORK");
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiError(body.message || "회원가입에 실패했습니다", body.code, body.fieldErrors);
    }
    _authToken = body.token || null;
    return body; // { token, user }
  },

  /**
   * Sign out the current user.
   *
   * 토큰을 즉시 로컬에서 비우고, 백엔드 POST /api/auth/logout 으로 블랙리스트 처리한다.
   * 네트워크 실패는 무시(로컬 로그아웃은 이미 완료).
   *
   * @returns {Promise<void>}
   */
  async logout() {
    const token = _authToken;
    _authToken = null;
    if (!token) return;
    try {
      await fetch(`${CONFIG.API_BASE_URL}/api/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ token }),
      });
    } catch {
      /* 네트워크 실패해도 로컬 로그아웃은 유지 */
    }
  },

  /**
   * Check whether an email is available.
   *
   * Adapter → 백엔드에는 email/계정 개념이 없고 식별자가 user_id 하나뿐이라,
   * email 문자열을 그대로 user_id 로 보고 `GET /api/check_user_id?id=<email>` 를
   * 호출한다. 응답 `{ exists: boolean }` 을 프론트가 기대하는 형식으로 변환하며,
   * 사용 가능한 경우 그 email 을 _userId 에 저장해 이후 register / start-from-crawl
   * 에서 재사용한다. (백엔드 무수정 — Phase 1)
   *
   * @param {string} email
   * @returns {Promise<{ available: true }>}
   * @throws {ApiError} when email is taken (code 'EMAIL_TAKEN', fieldErrors.email)
   */
  async checkEmailDuplicate(email) {
    let res;
    try {
      res = await fetch(
        `${CONFIG.API_BASE_URL}/api/check_user_id?id=${encodeURIComponent(email)}`,
        { headers: { ...authHeaders() } }
      );
    } catch {
      throw new ApiError("확인 중 오류가 발생했습니다", "NETWORK");
    }
    if (!res.ok) throw new ApiError("확인 중 오류가 발생했습니다", "NETWORK");
    const body = await res.json().catch(() => ({}));
    if (body.exists) {
      throw new ApiError("이메일 중복", "EMAIL_TAKEN", {
        email: "이미 사용 중인 이메일입니다",
      });
    }
    _userId = email; // 회원가입 흐름에서 이후 단계가 쓸 user_id로 채택
    return { available: true };
  },

  /**
   * Upload one face photo for a given angle slot.
   *
   * Adapter → 프론트는 각도별로 1장씩(총 5회) 호출하지만 백엔드 `POST /api/register`
   * 는 5장을 한 번에 받는다. 그래서 1~4번째 호출은 사진(data URL)을 메모리(_faceBuffer)
   * 에 담아두고 곧바로 success 로 응답하고, 5장이 모두 모이는 호출에서 한꺼번에
   * `/api/register` 로 전송한다. 재업로드("교체")는 해당 슬롯을 덮어쓰고 다시 등록한다
   * (백엔드가 INSERT OR REPLACE 라 idempotent). user_id 는 _userId(회원가입 시 확보)
   * 또는 임시 id 사용. 각도 실시간 검증(/api/validate_pose)은 웹캠 캡처 도입 시 추가 예정.
   *
   * @param {'L90'|'L45'|'F0'|'R45'|'R90'} angleKey
   * @param {Blob}   fileBlob   The image binary (백엔드는 data URL을 받으므로 미사용)
   * @param {string} dataUrl    The image as a data URL ("data:image/...;base64,...")
   * @returns {Promise<{ accepted: boolean, storedUrl: string }>}
   * @throws {ApiError} when the batch registration is rejected
   */
  async uploadFacePhoto(angleKey, fileBlob, dataUrl) {
    const backendKey = FACE_KEY_MAP[angleKey];
    if (!backendKey) throw new ApiError("알 수 없는 각도입니다", "WRONG_ANGLE");
    _faceBuffer[backendKey] = dataUrl;

    // 아직 5장이 다 모이지 않았으면 메모리에만 담아두고 성공으로 응답.
    if (Object.keys(_faceBuffer).length < 5) {
      return { accepted: true, storedUrl: dataUrl };
    }

    // 5장 완성 → 백엔드로 일괄 등록.
    let res;
    try {
      res = await fetch(`${CONFIG.API_BASE_URL}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          user_id: resolveUserId(),
          mode: "new",
          images: {
            front: _faceBuffer.front,
            left45: _faceBuffer.left45,
            right45: _faceBuffer.right45,
            left90: _faceBuffer.left90,
            right90: _faceBuffer.right90,
          },
        }),
      });
    } catch {
      throw new ApiError("얼굴 사진 등록 중 네트워크 오류가 발생했습니다", "NETWORK");
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.status !== "success") {
      throw new ApiError(body.message || "얼굴 사진 등록에 실패했습니다", "REGISTER_FAILED");
    }
    if (body.user_id) _userId = body.user_id; // 백엔드가 확정한 user_id 채택
    return { accepted: true, storedUrl: dataUrl };
  },

  /**
   * Start a new analysis run for the current user.
   *
   * Adapter → `POST /api/start-from-crawl` (body `{ user_id }`) 를 호출하고, 백엔드
   * 응답 `{ job_id }` 를 프론트가 기대하는 `{ analysisId }` 로 키 리매핑해서 반환한다.
   * user_id 는 _userId(회원가입 흐름에서 확보) 또는 임시 id 사용. (백엔드 무수정 — Phase 1)
   *
   * @returns {Promise<{ analysisId: string }>}
   */
  async startAnalysis() {
    let res;
    try {
      res = await fetch(`${CONFIG.API_BASE_URL}/api/start-from-crawl`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ user_id: resolveUserId() }),
      });
    } catch {
      throw new ApiError("분석을 시작할 수 없습니다", "START_FAILED");
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.job_id) {
      throw new ApiError("분석을 시작할 수 없습니다", "START_FAILED");
    }
    _analysisStartTime = Date.now(); // getAnalysisProgress(mock) 데모 타이머 — Phase 3에서 제거
    return { analysisId: body.job_id };
  },

  /**
   * Get current progress of a running analysis.
   * The component polls this every second.
   *
   * @param {string} [analysisId]
   * @returns {Promise<AnalysisProgress>}
   */
  async getAnalysisProgress(analysisId) {
    // TODO(backend-team): 이 함수는 백엔드 신규 개발 필요
    // 자세한 내용은 BACKEND_TODO.md 참고
    // Phase 3에서 처리 예정 (분석 진행 상황 — SSE /api/stream 또는 폴링 엔드포인트)
    // TODO(integration): GET `${CONFIG.API_BASE_URL}/analysis/${analysisId}/progress`
    //   headers: { ...authHeaders() }
    //   expected response: AnalysisProgress
    if (!_analysisStartTime) _analysisStartTime = Date.now();
    const elapsed = Date.now() - _analysisStartTime;
    const total = CONFIG.ANALYSIS_DEMO_DURATION_MS;
    const done = elapsed >= total;
    const remaining = Math.max(0, Math.ceil((total - elapsed) / 1000));
    return {
      scannedImages: _scannedBaseline + Math.floor(elapsed / 12),
      domainsScanning: 186 + Math.floor(Math.random() * 4),
      secondsRemaining: remaining,
      done,
    };
  },

  /**
   * Get the matches found by an analysis run.
   *
   * @param {string} [analysisId]
   * @returns {Promise<Match[]>}
   */
  async getAnalysisResults(analysisId) {
    // TODO(backend-team): 이 함수는 백엔드 신규 개발 필요
    // 자세한 내용은 BACKEND_TODO.md 참고
    // Phase 3에서 처리 예정 (분석 결과 — Evidence 필드 보강 + job/user 필터 필요)
    // TODO(integration): GET `${CONFIG.API_BASE_URL}/analysis/${analysisId}/results`
    //   headers: { ...authHeaders() }
    await sleep(250);
    return MOCK.matches;
  },

  /**
   * Submit a deletion request for the selected matches.
   *
   * @param {string[]}     matchIds
   * @param {ConsentFlags} consents
   * @param {string}       memo       Free-text note (≤ 500 chars)
   * @returns {Promise<RequestReceipt>}
   */
  async submitDeletionRequest(matchIds, consents, memo) {
    // TODO(backend-team): 이 함수는 백엔드 신규 개발 필요
    // 자세한 내용은 BACKEND_TODO.md 참고
    // Phase 5에서 처리 예정 (삭제 요청 — takedown 모듈 fan-out + 영수증 발급)
    // TODO(integration): POST `${CONFIG.API_BASE_URL}/deletion-requests`
    //   headers: { ...authHeaders(), "Content-Type": "application/json" }
    //   body:    { matchIds, consents, memo }
    //   expected response: RequestReceipt (server-generated receiptId & sentAt)
    await sleep(700);
    const now = new Date();
    return {
      receiptId: fmtReceiptId(now),
      count: matchIds.length,
      legalBasis: "정보통신망법 §44-2",
      sentAt: fmtReceiptTime(now),
      trackable: true,
    };
  },

  /**
   * Get the status overview (stats + items) for the current user.
   *
   * @param {'all'|'wait'|'done'|'review'} [filter='all']
   * @returns {Promise<StatusOverview>}
   */
  async getRequestStatus(filter = "all") {
    // TODO(backend-team): 이 함수는 백엔드 신규 개발 필요
    // 자세한 내용은 BACKEND_TODO.md 참고
    // Phase 5에서 처리 예정 (처리 현황 — user-scoped 추적 + 3-stage retry 모델)
    // TODO(integration): GET `${CONFIG.API_BASE_URL}/deletion-requests?status=${filter}`
    //   headers: { ...authHeaders() }
    //   Note: stats should reflect the FULL set (not filtered), since users
    //   need the overview regardless of which tab they're viewing.
    //   Backend may return stats and items as separate endpoints, or combined.
    await sleep(250);

    const all = MOCK.statusLog;
    // Stats derived from the entire dataset — never affected by `filter`.
    const stats = {
      total:  all.length,
      wait:   all.filter((r) => r.statusKind === "wait").length,
      review: all.filter((r) => r.statusKind === "review").length,
      done:   all.filter((r) => r.statusKind === "done").length,
    };

    const items =
      filter === "all" ? all : all.filter((r) => r.statusKind === filter);

    return { stats, items };
  },

  /**
   * Get the welcome dashboard summary (user info + cumulative stats).
   *
   * @returns {Promise<DashboardSummary>}
   */
  async getDashboardSummary() {
    // TODO(backend-team): 이 함수는 백엔드 신규 개발 필요
    // 자세한 내용은 BACKEND_TODO.md 참고
    // Phase 4에서 처리 예정 (대시보드 집계 — monitor/stats + Evidence/요청 카운트 합성)
    // TODO(integration): GET `${CONFIG.API_BASE_URL}/dashboard/summary`
    //   headers: { ...authHeaders() }
    await sleep(200);
    return {
      user: MOCK.user,
      totalIndexed: 1284902,
      matchesFound: 17,
      processed: 14,
      lastScan: "3일 전",
      averageDuration: "≈8min",
      scanScope: "전 영역",
    };
  },
};
