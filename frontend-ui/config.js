/**
 * App configuration — single source of environment-dependent constants.
 * Change values here when pointing to dev / staging / production backends.
 */
// 백엔드 origin. 개발 모드에서는 빈 문자열로 두고 Vite 프록시(vite.config.js)가
// /api/* 를 http://localhost:8080 으로 넘긴다. 프로덕션/별도 호스트로 붙일 때는
// .env 에 VITE_API_BASE_URL=https://api.example.com 처럼 지정한다.
// (엔드포인트 경로 자체는 services.js에서 "/api/..." 형태로 전부 명시한다.)
const API_BASE_URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL) ||
  "";

export const CONFIG = {
  API_BASE_URL,

  // localStorage key for persisting auth state across reloads.
  // (Note: wrapped in try/catch in AuthProvider so it works in restricted
  //  preview environments too.)
  AUTH_STORAGE_KEY: "fdr_auth_v1",

  // Demo: how long a single analysis run takes before getAnalysisProgress
  // reports done = true. Replace with real backend's ETA on integration.
  ANALYSIS_DEMO_DURATION_MS: 12000,
};
