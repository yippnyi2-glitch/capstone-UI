/**
 * App configuration — single source of environment-dependent constants.
 * Change values here when pointing to dev / staging / production backends.
 */
export const CONFIG = {
  // TODO(integration): replace with process.env.REACT_APP_API_BASE_URL or similar
  API_BASE_URL: "/api",

  // localStorage key for persisting auth state across reloads.
  // (Note: wrapped in try/catch in AuthProvider so it works in restricted
  //  preview environments too.)
  AUTH_STORAGE_KEY: "fdr_auth_v1",

  // Demo: how long a single analysis run takes before getAnalysisProgress
  // reports done = true. Replace with real backend's ETA on integration.
  ANALYSIS_DEMO_DURATION_MS: 12000,
};
