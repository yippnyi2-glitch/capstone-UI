import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    // 개발 중 CORS 회피: /api/* 요청을 백엔드 orchestrator(localhost:8080)로 프록시.
    // 프론트 코드는 항상 상대경로 "/api/..."로 호출하면 됨 (config.js의 API_BASE_URL = "").
    // SSE 스트림(/api/stream/{job_id})도 동일 경로라 함께 커버됨 (Phase 3에서 사용).
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
