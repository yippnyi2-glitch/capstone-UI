import React, { useEffect, useRef, useState } from "react";
import { T, FONT_SERIF, FONT_SANS, FONT_MONO } from "../styles/tokens";
import { useToast } from "../context/ToastContext";
import { services } from "../services";
import { Bracket, TopLabel } from "../shared/layout";
import { CtaPrimary } from "../shared/cta";

/* 32 × 16 = 512 — ArcFace 임베딩 차원 수와 동일한 격자로 추출 과정을 시각화한다. */
const GRID_COLS = 32;
const GRID_ROWS = 16;
const GRID_TOTAL = GRID_COLS * GRID_ROWS;

/**
 * 얼굴 특징 벡터 추출 시각화 화면.
 *
 * CaptureScreen(사진 5장 등록) 다음 단계. 사진 5장이 모두 업로드되면
 * 백엔드 POST /api/register 가 이미 ArcFace 512d 임베딩을 추출·저장한 상태이므로,
 * 이 화면은 (1) 추출 진행 애니메이션을 보여주고 (2) services.getFaceVectorSummary()
 * 로 방금 추출된 벡터의 요약(차원 수·정규화 노름·통계·샘플)을 받아 보여준 뒤
 * (3) "다음으로" 버튼으로 WelcomeScreen 으로 넘긴다.
 */
export default function VectorExtractScreen({ go }) {
  const toast = useToast();
  const [phase, setPhase] = useState("extracting"); // "extracting" | "done"
  const [pct, setPct] = useState(0);
  const [summary, setSummary] = useState(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;
    let raf;
    const MIN_MS = 2200; // 추출이 즉시 끝나도 최소 이만큼은 진행 애니메이션을 보여준다
    const CRUISE_MS = 2600; // 92% 까지 ease-out 으로 차오르는 시간

    // 1) 진행률 애니메이션 — 92% 에서 멈추고, 요약 데이터가 도착하면 100% 로 스냅
    const animate = () => {
      if (cancelled) return;
      const t = Math.min(1, (Date.now() - startedAt.current) / CRUISE_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      setPct((p) => Math.max(p, Math.round(eased * 92))); // 동일 값이면 React 가 리렌더 생략
      if (t < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    const finish = (s) => {
      if (cancelled) return;
      const wait = Math.max(0, MIN_MS - (Date.now() - startedAt.current));
      setTimeout(() => {
        if (cancelled) return;
        setSummary(s);
        setPct(100);
        setTimeout(() => !cancelled && setPhase("done"), 450);
      }, wait);
    };

    // 2) 방금 추출된 얼굴 특징 벡터 요약 조회 (실패해도 폴백 요약으로 화면은 완료)
    services
      .getFaceVectorSummary()
      .then(finish)
      .catch((e) => {
        console.error("[getFaceVectorSummary]", e);
        toast.error("특징 추출 결과를 불러오지 못했습니다");
        finish({ points: 512, imageCount: 5, l2Norm: 1, sample: [], stats: { min: 0, max: 0, mean: 0 }, source: "demo" });
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDone = phase === "done";
  const points = summary?.points ?? GRID_TOTAL;
  const filledCells = Math.round((pct / 100) * GRID_TOTAL);

  return (
    <div style={{ backgroundColor: T.bg, minHeight: "100vh" }}>
      <TopLabel
        left={[
          { label: "이용 약관", active: false },
          { label: "기본 정보", active: false },
          { label: "얼굴 등록", active: true },
        ]}
        right="회원가입"
      />

      <div
        style={{
          padding: "56px 56px 72px 56px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          maxWidth: 760,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            letterSpacing: "0.2em",
            color: T.muted,
            marginBottom: 22,
          }}
        >
          — 단계 02 / 02 — 얼굴 특징 벡터 추출
        </div>

        <Bracket
          style={{
            fontSize: 42,
            lineHeight: 1.26,
            display: "block",
            marginBottom: 14,
            letterSpacing: "-0.005em",
          }}
        >
          {isDone
            ? `${points.toLocaleString()}개의 특징점이 추출되었습니다`
            : "얼굴 특징을 추출하는 중입니다"}
        </Bracket>

        <div style={{ fontSize: 13, color: T.muted, marginBottom: 40, lineHeight: 1.7, maxWidth: 480 }}>
          {isDone
            ? "등록된 5장의 사진에서 당신만의 고유한 얼굴 특징 벡터를 생성했습니다. 이 벡터는 암호화되어 저장되며 분석 외 다른 용도로 사용되지 않습니다."
            : "등록된 사진을 정렬·정규화한 뒤 딥러닝 모델로 고유 특징을 계산하고 있습니다. 잠시만 기다려주세요."}
        </div>

        {/* 512-cell feature mesh */}
        <FeatureMesh filled={filledCells} done={isDone} />

        {/* Progress bar */}
        <div style={{ width: "100%", maxWidth: 420, marginTop: 28 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: T.muted,
              marginBottom: 10,
            }}
          >
            <span>{isDone ? "— 추출 완료" : "— 특징 추출 진행"}</span>
            <span style={{ fontFamily: FONT_SERIF, fontSize: 22, color: T.ink, letterSpacing: 0 }}>{pct}%</span>
          </div>
          <div style={{ height: 1, background: T.rule, position: "relative" }}>
            <div
              style={{
                position: "absolute",
                left: 0,
                top: -1,
                height: 3,
                width: `${pct}%`,
                background: T.green,
                transition: "width .3s ease",
              }}
            />
          </div>
        </div>

        {/* Summary + CTA — only after extraction completes */}
        {isDone && summary && (
          <div style={{ width: "100%", maxWidth: 480, marginTop: 40 }}>
            <SummaryPanel summary={summary} />
            <div style={{ display: "flex", justifyContent: "center", marginTop: 32 }}>
              <CtaPrimary onClick={() => go("welcome")}>
                <span>다음으로 — 분석 화면</span>
                <span>→</span>
              </CtaPrimary>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* 512칸 격자: 채워진 칸은 추출된 차원, 마지막 줄(frontier)은 현재 처리 중인 차원. */
function FeatureMesh({ filled, done }) {
  return (
    <div style={{ width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <style>{`
        @keyframes fdr-cell-in { from { opacity: 0; transform: scale(0.35); } to { opacity: 1; transform: scale(1); } }
        @keyframes fdr-cell-scan { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
      `}</style>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
          gap: 3,
          width: "100%",
          padding: 14,
          background: T.paper,
          border: `1px solid ${T.rule}`,
        }}
      >
        {Array.from({ length: GRID_TOTAL }, (_, i) => {
          const on = i < filled;
          const frontier = !done && on && i >= filled - GRID_COLS; // 마지막 한 줄 = 처리 중
          return (
            <div
              key={i}
              style={{
                aspectRatio: "1 / 1",
                background: on ? (frontier ? T.green : T.greenSoft) : T.bgDeep,
                opacity: on ? (frontier ? 1 : 0.85) : 0.45,
                animation: on
                  ? frontier
                    ? "fdr-cell-scan 1s ease-in-out infinite"
                    : "fdr-cell-in .25s ease both"
                  : undefined,
                transition: "background .2s, opacity .2s",
              }}
            />
          );
        })}
      </div>
      <div style={{ marginTop: 10, fontFamily: FONT_MONO, fontSize: 10, letterSpacing: "0.14em", color: T.mutedSoft }}>
        {done ? `${GRID_TOTAL} / ${GRID_TOTAL} DIMENSIONS` : `${Math.min(filled, GRID_TOTAL)} / ${GRID_TOTAL} DIMENSIONS`}
      </div>
    </div>
  );
}

function SummaryPanel({ summary }) {
  const n = (v, d = 4) => (typeof v === "number" ? v.toFixed(d) : "—");
  const rows = [
    ["특징 차원", `${(summary.points ?? 512).toLocaleString()} D · ArcFace`, true],
    ["사용 사진", `${summary.imageCount ?? 5} 장`, false],
    ["벡터 정규화", `L2 = ${n(summary.l2Norm, 3)}`, true],
    ["값 범위", `${n(summary.stats?.min)} ~ ${n(summary.stats?.max)}`, true],
    ["평균", n(summary.stats?.mean, 5), true],
  ];

  return (
    <div style={{ textAlign: "left" }}>
      <div style={{ background: T.paper, border: `1px solid ${T.rule}` }}>
        {rows.map(([k, v, mono], i) => (
          <div
            key={k}
            style={{
              display: "grid",
              gridTemplateColumns: "140px 1fr",
              padding: "14px 22px",
              borderBottom: i === rows.length - 1 ? "none" : `1px solid ${T.ruleSoft}`,
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: T.muted }}>{k}</span>
            <span
              style={{
                fontFamily: mono ? FONT_MONO : FONT_SANS,
                fontSize: 13,
                color: T.ink,
                textAlign: "right",
                letterSpacing: mono ? "0.04em" : "0",
              }}
            >
              {v}
            </span>
          </div>
        ))}
      </div>

      {summary.sample?.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: T.mutedSoft,
              marginBottom: 8,
            }}
          >
            특징 벡터 미리보기 · 앞 {summary.sample.length}개 차원
          </div>
          <SampleBars values={summary.sample} />
        </div>
      )}

      {summary.source === "demo" && (
        <div style={{ marginTop: 12, fontFamily: FONT_MONO, fontSize: 10, letterSpacing: "0.1em", color: T.mutedSoft }}>
          ※ 백엔드 미연결 — 데모 요약값을 표시 중
        </div>
      )}
    </div>
  );
}

function SampleBars({ values }) {
  const max = Math.max(...values.map((v) => Math.abs(v)), 1e-6);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 44, padding: "0 1px" }}>
      {values.map((v, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
          <div
            style={{
              height: `${Math.max(6, (Math.abs(v) / max) * 100)}%`,
              background: v >= 0 ? T.green : T.greenSoft,
              opacity: 0.85,
            }}
            title={v}
          />
        </div>
      ))}
    </div>
  );
}
