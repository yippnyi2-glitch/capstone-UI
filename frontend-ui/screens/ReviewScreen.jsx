import React, { useState, useEffect } from "react";
import { T, FONT_SERIF, FONT_SANS, FONT_MONO } from "../styles/tokens";
import { useToast } from "../context/ToastContext";
import { ApiError, services } from "../services";
import { Bracket, TopLabel } from "../shared/layout";
import { CtaPrimary, CtaGhost } from "../shared/cta";
import { Checkbox, FieldLabel } from "../shared/form";
import { BlurredThumb } from "../shared/misc";

export default function ReviewScreen({ go, selected, setReceipt }) {
  const toast = useToast();
  /** @type {[Match[], Function]} */
  const [allMatches, setAllMatches] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Re-fetch matches so that a direct deep-link to /review still works.
  useEffect(() => {
    let cancelled = false;
    services
      .getAnalysisResults()
      .then((m) => !cancelled && setAllMatches(m))
      .catch((e) => {
        toast.error("매치 정보를 불러오지 못했습니다");
        console.error("[getAnalysisResults]", e);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = (
    selected.length
      ? selected.map((id) => allMatches.find((m) => m.id === id))
      : allMatches.slice(0, 3)
  ).filter(Boolean);

  const [agree1, setAgree1] = useState(true);
  const [agree3, setAgree3] = useState(false);
  const [memo, setMemo] = useState("");

  const canSend = agree1 && items.length > 0 && !submitting;

  const onSubmit = async () => {
    if (!canSend) return;
    setSubmitting(true);
    try {
      const receipt = await services.submitDeletionRequest(
        items.map((m) => m.id),
        { delivery: agree1, statistics: agree3 },
        memo
      );
      setReceipt(receipt);
      toast.success(`${receipt.count}건의 삭제 요청이 발송되었습니다`);
      go("sent");
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "삭제 요청 전송에 실패했습니다"
      );
      console.error("[submitDeletionRequest]", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ backgroundColor: T.bg, minHeight: "100vh" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1px 1fr",
          minHeight: "100vh",
          backgroundColor: T.bg,
        }}
      >
        {/* LEFT — review */}
        <div style={{ padding: "30px 56px 60px 56px" }}>
          <div
            style={{
              fontFamily: FONT_SANS,
              fontSize: 11,
              letterSpacing: "0.18em",
              color: T.muted,
              textTransform: "uppercase",
              marginBottom: 28,
            }}
          >
            — 삭제 요청 — 검토
          </div>

          <Bracket
            style={{
              fontSize: 36,
              lineHeight: 1.25,
              display: "block",
              letterSpacing: "-0.005em",
              marginBottom: 18,
            }}
          >
            선택하신 3건에 대한
            <br />삭제 요청을 검토합니다
          </Bracket>

          <div style={{ fontSize: 13, color: T.inkSoft, marginBottom: 36, lineHeight: 1.7 }}>
            전송 후에는 취소할 수 없으니 신중히 확인해주세요.
          </div>

          {/* Selected items list (compact) */}
          <div
            style={{
              borderTop: `1px solid ${T.rule}`,
              borderBottom: `1px solid ${T.rule}`,
              marginBottom: 28,
            }}
          >
            {items.map((m) => (
              <div
                key={m.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "44px 1fr auto",
                  alignItems: "center",
                  gap: 16,
                  padding: "14px 0",
                  borderBottom: `1px dashed ${T.ruleSoft}`,
                }}
              >
                <BlurredThumb size={36} />
                <div>
                  <div style={{ fontSize: 13, color: T.ink, marginBottom: 2 }}>
                    {m.domain}
                  </div>
                  <div
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 10,
                      color: T.muted,
                      letterSpacing: "0.04em",
                    }}
                  >
                    유사도 {m.similarity}% · {m.date}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Summary box */}
          <div
            style={{
              background: T.paper,
              border: `1px solid ${T.rule}`,
              padding: "20px 24px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 14,
                paddingBottom: 14,
                borderBottom: `1px dashed ${T.ruleSoft}`,
              }}
            >
              <span style={{ fontSize: 11, color: T.muted, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                대상 항목
              </span>
              <span style={{ fontFamily: FONT_SERIF, fontSize: 22, color: T.ink }}>
                {items.length}건
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: T.muted, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                예상 처리 시간
              </span>
              <span style={{ fontFamily: FONT_SERIF, fontSize: 22, color: T.ink }}>
                2일 — 6일
              </span>
            </div>
          </div>
        </div>

        {/* DIVIDER */}
        <div style={{ background: T.rule }} />

        {/* RIGHT — consent */}
        <div style={{ padding: "30px 56px 60px 56px" }}>
          <div
            style={{
              fontFamily: FONT_SANS,
              fontSize: 11,
              letterSpacing: "0.18em",
              color: T.muted,
              textTransform: "uppercase",
              marginBottom: 28,
            }}
          >
            — 동의 여부 확인
          </div>

          <Bracket
            style={{
              fontSize: 36,
              lineHeight: 1.25,
              display: "block",
              letterSpacing: "-0.005em",
              marginBottom: 36,
            }}
          >
            동의 사항을 확인해주세요
          </Bracket>

          <FieldLabel hint="선택">추가 전달 사항</FieldLabel>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value.slice(0, 500))}
            placeholder="예) 해당 게시물은 본인의 동의 없이 합성·게시된 이미지입니다. 신속한 삭제 처리를 부탁드립니다."
            style={{
              width: "100%",
              minHeight: 110,
              background: "transparent",
              border: `1px solid ${T.rule}`,
              padding: "12px 14px",
              fontFamily: FONT_SANS,
              fontSize: 13,
              color: T.ink,
              outline: "none",
              resize: "vertical",
              lineHeight: 1.6,
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              color: T.mutedSoft,
              letterSpacing: "0.06em",
              marginTop: 8,
              marginBottom: 32,
            }}
          >
            <span>호스팅 사업자에게 함께 전달할 추가 메시지를 500자 이내로 작성해주세요</span>
            <span style={{ fontFamily: FONT_MONO }}>
              {memo.length} / 500
            </span>
          </div>

          {/* Consent items */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <ConsentItem
              checked={agree1}
              onToggle={() => setAgree1((v) => !v)}
              title="삭제 요청 발송 동의"
              body="본 시스템이 사용자 본인의 명의로 호스팅 사업자에게 삭제 요청서를 발송하는 것에 동의합니다."
              required
            />
            <ConsentItem
              checked={agree3}
              onToggle={() => setAgree3((v) => !v)}
              title="익명 통계 활용 동의"
              body="처리 결과를 익명화하여 서비스 개선을 위한 통계로 활용하는 것에 동의합니다."
              required={false}
            />
          </div>

          {/* Bottom CTA row */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 56,
            }}
          >
            <CtaGhost onClick={() => go("results")}>← 결과로 돌아가기</CtaGhost>
            <CtaPrimary
              onClick={onSubmit}
              style={{
                opacity: canSend ? 1 : 0.4,
                pointerEvents: canSend ? "auto" : "none",
              }}
            >
              <span>{submitting ? "전송 중…" : "삭제 요청 전송"}</span>
              <span>→</span>
            </CtaPrimary>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConsentItem({ checked, onToggle, title, body, required }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "24px 1fr",
        gap: 14,
        cursor: "pointer",
      }}
      onClick={onToggle}
    >
      <Checkbox checked={checked} onChange={onToggle} />
      <div>
        <div style={{ marginBottom: 4, display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: FONT_SANS, fontSize: 13, color: T.ink, fontWeight: 500 }}>
            {title}
          </span>
          <span
            style={{
              fontSize: 10,
              color: required ? T.green : T.mutedSoft,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              border: `1px solid ${required ? T.green : T.mutedSoft}`,
              padding: "1px 6px",
            }}
          >
            {required ? "필수" : "선택"}
          </span>
        </div>
        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
          {body}
        </div>
      </div>
    </div>
  );
}
