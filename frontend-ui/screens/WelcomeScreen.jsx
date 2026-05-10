import React from "react";
import { T, FONT_SERIF, FONT_SANS } from "../styles/tokens";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { services, MOCK } from "../services";
import { Bracket, TopLabel } from "../shared/layout";
import { UserBadge } from "../shared/misc";

export default function WelcomeScreen({ go }) {
  const auth = useAuth();
  const toast = useToast();

  // Auth user → MOCK fallback (last-resort for dev pager jumps without login)
  const user = auth.user || MOCK.user;

  const onAnalyze = async () => {
    try {
      await services.startAnalysis();
      go("analyzing");
    } catch (e) {
      toast.error("분석을 시작하지 못했습니다");
      console.error("[startAnalysis]", e);
    }
  };

  return (
    <div
      style={{
        backgroundColor: T.bg,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <TopLabel left="— 분석 화면" right="" />

      <div
        style={{
          padding: "30px 56px 64px 56px",
        }}
      >
        {/* Header row: title + user badge */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 44,
          }}
        >
          <Bracket
            style={{
              fontSize: 44,
              lineHeight: 1.2,
              letterSpacing: "-0.005em",
              maxWidth: 760,
              display: "block",
            }}
          >
            안녕하세요, {user.name}님
          </Bracket>
          <UserBadge name={user.name} refCode={user.ref} />
        </div>

        {/* Dark CTA panel — moderate hero size */}
        <div
          style={{
            background: T.cta,
            color: T.ctaInk,
            padding: "52px 52px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
            minHeight: 280,
          }}
        >
          {/* Decorative concentric rings */}
          <svg
            style={{
              position: "absolute",
              right: -80,
              top: "50%",
              transform: "translateY(-50%)",
              opacity: 0.18,
              pointerEvents: "none",
            }}
            width="380"
            height="380"
            viewBox="0 0 380 380"
          >
            <circle cx="190" cy="190" r="180" fill="none" stroke={T.ctaInk} strokeWidth="0.6" />
            <circle
              cx="190"
              cy="190"
              r="135"
              fill="none"
              stroke={T.ctaInk}
              strokeWidth="0.4"
              strokeDasharray="2 5"
            />
            <circle cx="190" cy="190" r="82" fill="none" stroke={T.ctaInk} strokeWidth="0.4" />
            <circle cx="190" cy="190" r="42" fill="none" stroke={T.ctaInk} strokeWidth="0.4" strokeDasharray="2 4" />
          </svg>

          <div style={{ position: "relative", maxWidth: 680 }}>
            <Bracket
              style={{
                fontSize: 34,
                lineHeight: 1.32,
                color: T.ctaInk,
                display: "block",
                marginBottom: 32,
                fontFamily: FONT_SERIF,
                letterSpacing: "-0.005em",
              }}
            >
              당신의 얼굴이 어디에 있는지
              <br />지금 확인해보세요
            </Bracket>

            <button
              onClick={onAnalyze}
              style={{
                background: T.ctaInk,
                color: T.cta,
                border: "none",
                padding: "15px 26px",
                fontFamily: FONT_SANS,
                fontSize: 13,
                letterSpacing: "0.1em",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 38,
                transition: "opacity .15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              <span>분석 실행</span>
              <span>→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
