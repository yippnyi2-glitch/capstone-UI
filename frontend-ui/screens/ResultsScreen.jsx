import React, { useState, useEffect } from "react";
import { T, FONT_SERIF, FONT_SANS, FONT_MONO } from "../styles/tokens";
import { useToast } from "../context/ToastContext";
import { services } from "../services";
import { fmtKstTimestamp } from "../shared/utils";
import { Bracket, TopLabel } from "../shared/layout";
import { CtaPrimary, CtaGhost } from "../shared/cta";
import { Checkbox } from "../shared/form";
import { BlurredThumb } from "../shared/misc";

export default function ResultsScreen({ go, selected, setSelected }) {
  const toast = useToast();
  /** @type {[Match[], Function]} */
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  // Analysis completion timestamp.
  // Mock: captured when user lands on results screen (≈ moment of completion).
  // TODO(integration): replace with `completedAt` from getAnalysisResults() metadata.
  const [completedAt] = useState(() => fmtKstTimestamp(new Date()));

  useEffect(() => {
    let cancelled = false;
    services
      .getAnalysisResults()
      .then((m) => {
        if (cancelled) return;
        setMatches(m);
        setLoading(false);
      })
      .catch((e) => {
        toast.error("분석 결과를 불러오지 못했습니다");
        console.error("[getAnalysisResults]", e);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleAll = () => {
    if (selected.length === matches.length) setSelected([]);
    else setSelected(matches.map((m) => m.id));
  };
  const toggle = (id) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  return (
    <div style={{ backgroundColor: T.bg, minHeight: "100vh" }}>
      <TopLabel left="— 분석 결과" right={completedAt} />

      <div style={{ padding: "30px 56px 0 56px" }}>
        {/* Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            alignItems: "end",
            gap: 64,
            marginBottom: 36,
          }}
        >
          <Bracket
            style={{
              fontSize: 38,
              lineHeight: 1.25,
              display: "block",
              letterSpacing: "-0.005em",
            }}
          >
            총 {loading ? "—" : matches.length}건의 유사 이미지가
            <br />탐지되었습니다
          </Bracket>
          <div
            style={{
              fontSize: 13,
              color: T.inkSoft,
              lineHeight: 1.7,
              paddingBottom: 8,
            }}
          >
            각 항목을 검토한 후 삭제 요청을 진행할 수 있습니다.
          </div>
        </div>

        {/* Sort + selected meta */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 11,
            color: T.muted,
            letterSpacing: "0.06em",
            marginBottom: 8,
          }}
        >
          <span>정렬 — 유사도 높은 순 ↓</span>
          <span>
            <button
              onClick={toggleAll}
              style={{
                background: "none",
                border: "none",
                fontFamily: FONT_SANS,
                fontSize: 11,
                color: T.muted,
                cursor: "pointer",
                letterSpacing: "0.06em",
                marginRight: 16,
                textDecoration: "underline",
                textUnderlineOffset: 4,
              }}
            >
              {selected.length === matches.length ? "전체 해제" : "전체 선택"}
            </button>
            선택됨 {selected.length} / {matches.length}
          </span>
        </div>

        {/* Results list */}
        <div style={{ borderTop: `1px solid ${T.rule}` }}>
          {matches.map((m) => (
            <ResultRow
              key={m.id}
              m={m}
              selected={selected.includes(m.id)}
              onToggle={() => toggle(m.id)}
            />
          ))}
        </div>
      </div>

      {/* Bottom action bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "32px 56px 64px 56px",
        }}
      >
        <CtaGhost onClick={() => go("welcome")}>← 분석 화면으로</CtaGhost>
        <div style={{ fontSize: 12, color: T.muted, letterSpacing: "0.04em" }}>
          <span style={{ fontFamily: FONT_SERIF, fontSize: 22, color: T.ink, marginRight: 6 }}>
            {selected.length}
          </span>
          건 선택됨
        </div>
        <CtaPrimary
          onClick={() => {
            if (selected.length === 0) {
              setSelected(matches.slice(0, 3).map((m) => m.id));
            }
            go("review");
          }}
        >
          <span>선택 항목 삭제 요청</span>
          <span>→</span>
        </CtaPrimary>
      </div>
    </div>
  );
}

function ResultRow({ m, selected, onToggle }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "32px 80px 1.4fr 1.6fr",
        alignItems: "center",
        gap: 20,
        padding: "20px 0",
        borderBottom: `1px solid ${T.rule}`,
      }}
    >
      <Checkbox checked={selected} onChange={onToggle} />

      <BlurredThumb />

      <div>
        <div style={{ fontSize: 14, color: T.ink, marginBottom: 4 }}>{m.domain}</div>
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            color: T.muted,
            letterSpacing: "0.04em",
          }}
        >
          {m.date} · {m.time}
        </div>
      </div>

      {/* Similarity bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            flex: 1,
            height: 1,
            background: T.rule,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: -1,
              height: 3,
              width: `${m.similarity}%`,
              background: T.green,
            }}
          />
        </div>
        <div
          style={{
            fontFamily: FONT_SERIF,
            fontSize: 18,
            color: T.ink,
            minWidth: 44,
            textAlign: "right",
          }}
        >
          {m.similarity}%
        </div>
      </div>
    </div>
  );
}
