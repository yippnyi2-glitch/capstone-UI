import React, { useEffect } from "react";
import { T, FONT_SERIF, FONT_SANS, FONT_MONO } from "../styles/tokens";
import { useToast } from "../context/ToastContext";
import { services } from "../services";
import { Bracket, TopLabel } from "../shared/layout";

export default function AnalyzingScreen({ go }) {
  const toast = useToast();

  // Poll progress every second; auto-advance to results when done.
  useEffect(() => {
    let cancelled = false;
    let intervalId;
    const tick = async () => {
      try {
        const p = await services.getAnalysisProgress();
        if (cancelled) return;
        if (p.done) {
          clearInterval(intervalId);
          // brief delay before transition for a smoother feel
          setTimeout(() => !cancelled && go("results"), 600);
        }
      } catch (e) {
        toast.error("분석 진행 상황을 불러오지 못했습니다");
        console.error("[getAnalysisProgress]", e);
      }
    };
    tick();
    intervalId = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ backgroundColor: T.bg, minHeight: "100vh" }}>
      <TopLabel left="— 분석 진행 중 — 중단하지 마세요" right="" />

      <div
        style={{
          padding: "60px 56px 80px 56px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          maxWidth: 720,
          margin: "0 auto",
        }}
      >
        {/* Scanner circle */}
        <ScannerOrb />

        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            letterSpacing: "0.2em",
            color: T.muted,
            margin: "32px 0 16px 0",
          }}
        >
          — 분석 진행 중 — 중단하지 마세요
        </div>

        <Bracket
          style={{
            fontSize: 44,
            lineHeight: 1.25,
            display: "block",
            marginBottom: 16,
            letterSpacing: "-0.005em",
          }}
        >
          당신의 얼굴을 찾고 있습니다
        </Bracket>

        <div style={{ fontSize: 13, color: T.muted, marginBottom: 48 }}>
          탐지가 완료되면 자동으로 결과 화면으로 이동합니다
        </div>
      </div>
    </div>
  );
}

function ScannerOrb() {
  return (
    <div style={{ position: "relative", width: 180, height: 180 }}>
      <style>{`
        @keyframes fdr-spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
        @keyframes fdr-pulse { 0%,100% { opacity: 0.55; transform: scale(1);} 50% { opacity: 1; transform: scale(1.04);} }
      `}</style>

      {/* outer dashed ring (rotating) */}
      <svg
        viewBox="0 0 180 180"
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          inset: 0,
          animation: "fdr-spin 20s linear infinite",
        }}
      >
        <circle
          cx="90"
          cy="90"
          r="86"
          fill="none"
          stroke={T.muted}
          strokeWidth="0.8"
          strokeDasharray="2 6"
          opacity="0.55"
        />
      </svg>

      {/* mid solid ring */}
      <svg
        viewBox="0 0 180 180"
        style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
      >
        <circle cx="90" cy="90" r="64" fill={T.paper} stroke={T.rule} strokeWidth="1" />
        {/* iris band */}
        <circle
          cx="90"
          cy="90"
          r="40"
          fill="none"
          stroke={T.greenSoft}
          strokeWidth="1"
          strokeDasharray="1 3"
          opacity="0.7"
        />
      </svg>

      {/* center dot pulse */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 14,
          height: 14,
          marginLeft: -7,
          marginTop: -7,
          background: T.green,
          borderRadius: "50%",
          animation: "fdr-pulse 1.6s ease-in-out infinite",
          boxShadow: `0 0 0 6px rgba(30,69,52,0.12)`,
        }}
      />
    </div>
  );
}
