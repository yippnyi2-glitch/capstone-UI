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
   * @param {string} email
   * @param {string} password
   * @returns {Promise<AuthResult>}
   * @throws {ApiError} when credentials are invalid
   */
  async login(email, password) {
    // TODO(integration): POST `${CONFIG.API_BASE_URL}/auth/login`
    //   headers: { "Content-Type": "application/json" }
    //   body:    { email, password }
    //   expected response: { token, user }
    //   on 4xx: throw new ApiError(message, code, fieldErrors)
    await sleep(400);
    const result = {
      token: "mock-token-" + Date.now(),
      user: { ...MOCK.user, email: email || MOCK.user.email },
    };
    _authToken = result.token;
    return result;
  },

  /**
   * Create a new account.
   *
   * @param {SignupProfile} profile
   * @returns {Promise<AuthResult>}
   * @throws {ApiError} when validation fails (with fieldErrors)
   */
  async signup(profile) {
    // TODO(integration): POST `${CONFIG.API_BASE_URL}/auth/signup`
    //   headers: { "Content-Type": "application/json" }
    //   body:    profile
    //   expected response: { token, user }
    //   on 4xx: throw new ApiError(message, code, fieldErrors)
    //     example: throw new ApiError("validation failed", "VALIDATION",
    //              { email: "이미 사용 중", password: "너무 짧음" })
    await sleep(500);
    const result = {
      token: "mock-token-" + Date.now(),
      user: { ...MOCK.user, email: profile.email, name: profile.name },
    };
    _authToken = result.token;
    return result;
  },

  /**
   * Sign out the current user.
   *
   * @returns {Promise<void>}
   */
  async logout() {
    // TODO(integration): POST `${CONFIG.API_BASE_URL}/auth/logout`
    //   headers: { ...authHeaders() }
    _authToken = null;
  },

  /**
   * Check whether an email is available.
   *
   * @param {string} email
   * @returns {Promise<{ available: true }>}
   * @throws {ApiError} when email is taken (code 'EMAIL_TAKEN', fieldErrors.email)
   */
  async checkEmailDuplicate(email) {
    // TODO(integration): GET `${CONFIG.API_BASE_URL}/auth/check-email?email=${...}`
    //   on 409: throw new ApiError("이메일 중복", "EMAIL_TAKEN",
    //                              { email: "이미 사용 중인 이메일입니다" })
    await sleep(700);
    if (email.includes("taken")) {
      throw new ApiError("이메일 중복", "EMAIL_TAKEN", {
        email: "이미 사용 중인 이메일입니다",
      });
    }
    return { available: true };
  },

  /**
   * Upload one face photo for a given angle slot.
   *
   * @param {'L90'|'L45'|'F0'|'R45'|'R90'} angleKey
   * @param {Blob}   fileBlob   The image binary
   * @param {string} dataUrl    Optional preview data URL (for client-side display)
   * @returns {Promise<{ accepted: boolean, storedUrl: string }>}
   * @throws {ApiError} when file is rejected (e.g., no face detected)
   */
  async uploadFacePhoto(angleKey, fileBlob, dataUrl) {
    // TODO(integration): POST `${CONFIG.API_BASE_URL}/face-photos` (multipart)
    //   headers: { ...authHeaders() }   (do NOT set Content-Type for multipart)
    //   body:    FormData with fields: angle, file
    //   on 4xx: throw new ApiError(message, code) — codes:
    //     'FACE_NOT_DETECTED' / 'FILE_TOO_LARGE' / 'INVALID_FORMAT' / 'WRONG_ANGLE'
    await sleep(300);
    return { accepted: true, storedUrl: "mock://stored" };
  },

  /**
   * Start a new analysis run for the current user.
   *
   * @returns {Promise<{ analysisId: string }>}
   */
  async startAnalysis() {
    // TODO(integration): POST `${CONFIG.API_BASE_URL}/analysis`
    //   headers: { ...authHeaders() }
    //   expected response: { analysisId }
    await sleep(200);
    _analysisStartTime = Date.now();
    return { analysisId: "a-" + Date.now() };
  },

  /**
   * Get current progress of a running analysis.
   * The component polls this every second.
   *
   * @param {string} [analysisId]
   * @returns {Promise<AnalysisProgress>}
   */
  async getAnalysisProgress(analysisId) {
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
