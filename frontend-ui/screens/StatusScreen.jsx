import React, { useState, useEffect } from "react";
import { T, FONT_SERIF, FONT_SANS, FONT_MONO } from "../styles/tokens";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { services, MOCK } from "../services";
import { Bracket, TopLabel } from "../shared/layout";
import { CtaGhost } from "../shared/cta";

export default function StatusScreen({ go }) {
  const auth = useAuth();
  const toast = useToast();
  const [filter, setFilter] = useState("전체");
  /** @type {[StatusOverview|null, Function]} */
  const [overview, setOverview] = useState(null);

  // Map Korean filter label to API filter key
  const filterKey = (label) =>
    ({
      "전체": "all",
      "응답 대기": "wait",
      "삭제 완료": "done",
      "검토 대기": "review",
    }[label] || "all");

  useEffect(() => {
    let cancelled = false;
    services
      .getRequestStatus(filterKey(filter))
      .then((o) => !cancelled && setOverview(o))
      .catch((e) => {
        toast.error("처리 현황을 불러오지 못했습니다");
        console.error("[getRequestStatus]", e);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const user = auth.user || MOCK.user;
  const stats = overview?.stats || {
    total: 0,
    wait: 0,
    review: 0,
    done: 0,
  };
  const filtered = overview?.items || [];

  return (
    <div style={{ backgroundColor: T.bg, minHeight: "100vh" }}>
      <TopLabel left="— 현황 확인 / 처리 추적" right="" />

      <div style={{ padding: "30px 56px 64px 56px" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 36,
          }}
        >
          <Bracket
            style={{
              fontSize: 42,
              lineHeight: 1.2,
              display: "block",
              letterSpacing: "-0.005em",
            }}
          >
            전체 처리 현황
          </Bracket>

          <div
            style={{
              background: T.paper,
              border: `1px solid ${T.rule}`,
              padding: "10px 14px 10px 10px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 12,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: T.green,
                color: T.ctaInk,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: FONT_SERIF,
                fontSize: 14,
              }}
            >
              {user.name?.[0] || "U"}
            </div>
            <div>
              <div style={{ fontWeight: 500, color: T.ink }}>{user.name}</div>
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  color: T.muted,
                  letterSpacing: "0.04em",
                }}
              >
                총 {stats.total}건 · {stats.done}건 완료
              </div>
            </div>
          </div>
        </div>

        {/* 4 stat cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            borderTop: `1px solid ${T.rule}`,
            borderBottom: `1px solid ${T.rule}`,
            marginBottom: 28,
          }}
        >
          <StatusStat label="총 요청" value={String(stats.total)} />
          <StatusStat label="응답 대기" value={String(stats.wait)} divider />
          <StatusStat label="검토 대기" value={String(stats.review)} tone={T.warn} divider />
          <StatusStat label="삭제 완료" value={String(stats.done)} tone={T.green} divider />
        </div>

        {/* Filter tabs */}
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 24,
          }}
        >
          {["전체", "응답 대기", "검토 대기", "삭제 완료"].map((label) => (
            <button
              key={label}
              onClick={() => setFilter(label)}
              style={{
                background: filter === label ? T.ink : "transparent",
                color: filter === label ? T.ctaInk : T.ink,
                border: `1px solid ${filter === label ? T.ink : T.rule}`,
                padding: "8px 14px",
                fontFamily: FONT_SANS,
                fontSize: 12,
                letterSpacing: "0.04em",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "100px 1.4fr 0.9fr 1fr",
            gap: 20,
            padding: "14px 0",
            borderTop: `1px solid ${T.rule}`,
            borderBottom: `1px solid ${T.rule}`,
            fontSize: 11,
            color: T.muted,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            alignItems: "center",
          }}
        >
          <span>요청 ID</span>
          <span>출처 / 시각</span>
          <span>상태</span>
          <span>처리 진행</span>
        </div>

        {filtered.map((r) => (
          <StatusRow key={r.id} r={r} />
        ))}
      </div>
    </div>
  );
}

function StatusStat({ label, value, tone, divider }) {
  return (
    <div
      style={{
        padding: "20px 24px",
        borderLeft: divider ? `1px solid ${T.rule}` : "none",
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: T.muted,
          marginBottom: 12,
        }}
      >
        — {label}
      </div>
      <div
        style={{
          fontFamily: FONT_SERIF,
          fontSize: 44,
          lineHeight: 1,
          color: tone || T.ink,
          letterSpacing: "-0.02em",
          fontWeight: 400,
          fontStyle: tone ? "italic" : "normal",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function StatusRow({ r }) {
  const tone = {
    wait: { bg: "transparent", color: T.muted, border: T.rule },
    done: { bg: "transparent", color: T.green, border: T.green },
    review: { bg: "transparent", color: T.warn, border: T.warn },
  }[r.statusKind];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "100px 1.4fr 0.9fr 1fr",
        gap: 20,
        padding: "20px 0",
        borderBottom: `1px solid ${T.rule}`,
        alignItems: "center",
      }}
    >
      <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: T.muted, letterSpacing: "0.04em" }}>
        {r.id}
      </span>
      <div>
        <div style={{ fontSize: 14, color: T.ink, marginBottom: 4 }}>{r.domain}</div>
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 10,
            color: T.muted,
            letterSpacing: "0.04em",
          }}
        >
          {r.when}
        </div>
      </div>
      <span>
        <span
          style={{
            display: "inline-block",
            border: `1px solid ${tone.border}`,
            color: tone.color,
            padding: "4px 10px",
            fontSize: 11,
            letterSpacing: "0.06em",
            borderRadius: 999,
          }}
        >
          {r.status}
        </span>
      </span>
      <ProgressDots stages={r.progress} color={tone.color} />
    </div>
  );
}

function ProgressDots({ stages, color = T.green }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {stages.map((s, i) => (
        <React.Fragment key={i}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: s ? color : "transparent",
              border: `1px solid ${s ? color : T.muted}`,
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          {i < stages.length - 1 && (
            <span
              style={{
                flex: 1,
                height: 1,
                background: stages[i + 1] === 1 && s === 1 ? color : T.rule,
              }}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
