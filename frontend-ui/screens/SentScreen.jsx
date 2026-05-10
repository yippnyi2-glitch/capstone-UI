import React from "react";
import { T, FONT_SERIF, FONT_SANS, FONT_MONO } from "../styles/tokens";
import { Bracket } from "../shared/layout";
import { CtaPrimary, CtaGhost } from "../shared/cta";

export default function SentScreen({ go, receipt }) {
  // Fallback values if user lands here without going through ReviewScreen
  const r = receipt || {
    receiptId: "RCP-—",
    count: 0,
    legalBasis: "—",
    sentAt: "—",
    trackable: false,
  };

  const rows = [
    ["요청 영수증", r.receiptId],
    ["요청 항목", `${r.count}건`],
    ["법적 근거", r.legalBasis],
    ["발송 시각", r.sentAt],
    ["추적 가능", r.trackable ? "Yes — Dashboard" : "No"],
  ];

  return (
    <div style={{ backgroundColor: T.bg, minHeight: "100vh" }}>
      <div
        style={{
          padding: "60px 56px 60px 56px",
          maxWidth: 560,
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        {/* Big check */}
        <div
          style={{
            width: 84,
            height: 84,
            borderRadius: "50%",
            background: T.green,
            color: T.ctaInk,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 28px",
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            letterSpacing: "0.2em",
            color: T.muted,
            marginBottom: 24,
          }}
        >
          — 삭제 요청 전송 완료
        </div>

        <Bracket
          style={{
            fontSize: 42,
            lineHeight: 1.22,
            display: "block",
            letterSpacing: "-0.005em",
            marginBottom: 18,
          }}
        >
          {r.count}건의 삭제 요청이
          <br />성공적으로 발송되었습니다
        </Bracket>

        <div
          style={{
            fontSize: 13,
            color: T.muted,
            marginBottom: 44,
            lineHeight: 1.7,
          }}
        >
          각 호스팅 사업자가 2~6일 내에 검토 후 응답합니다.
          진행 상황은 대시보드에서 추적할 수 있습니다.
        </div>

        {/* Receipt */}
        <div
          style={{
            background: T.paper,
            border: `1px solid ${T.rule}`,
            textAlign: "left",
            marginBottom: 40,
          }}
        >
          {rows.map(([k, v], i) => (
            <div
              key={k}
              style={{
                display: "grid",
                gridTemplateColumns: "150px 1fr",
                padding: "16px 24px",
                borderBottom: i === rows.length - 1 ? "none" : `1px solid ${T.ruleSoft}`,
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: T.muted,
                }}
              >
                {k}
              </span>
              <span
                style={{
                  fontFamily: i === 0 || i === 3 ? FONT_MONO : FONT_SANS,
                  fontSize: 14,
                  color: T.ink,
                  textAlign: "right",
                  letterSpacing: i === 0 || i === 3 ? "0.04em" : "0",
                }}
              >
                {v}
              </span>
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <CtaGhost onClick={() => go("welcome")}>분석 화면으로</CtaGhost>
          <CtaPrimary onClick={() => go("status")}>
            <span>현황 확인 대시보드</span>
            <span>→</span>
          </CtaPrimary>
        </div>
      </div>
    </div>
  );
}
