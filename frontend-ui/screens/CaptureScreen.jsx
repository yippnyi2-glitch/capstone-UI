import React, { useState, useRef, useEffect } from "react";
import { T, FONT_SERIF, FONT_SANS, FONT_MONO, grainBg } from "../styles/tokens";
import { useToast } from "../context/ToastContext";
import { ApiError, services } from "../services";
import { FACE_REFS } from "../assets/faceRefs";
import { Bracket, TopLabel } from "../shared/layout";
import { CtaPrimary, CtaGhost } from "../shared/cta";

export default function CaptureScreen({ go }) {
  const toast = useToast();
  const angles = [
    { key: "L90", label: "좌 90°", deg: -90, hint: "왼쪽 옆모습" },
    { key: "L45", label: "좌 45°", deg: -45, hint: "왼쪽 3/4" },
    { key: "F0", label: "정면 0°", deg: 0, core: true, hint: "정면 전체" },
    { key: "R45", label: "우 45°", deg: 45, hint: "오른쪽 3/4" },
    { key: "R90", label: "우 90°", deg: 90, hint: "오른쪽 옆모습" },
  ];

  const [images, setImages] = useState({});
  const [uploading, setUploading] = useState({}); // angle → boolean
  const completed = Object.keys(images).length;
  const pct = (completed / angles.length) * 100;

  const handleUpload = async (key, dataURL, file) => {
    // 즉시 미리보기 표시 — 사용자 체감 latency 감소
    setImages((p) => ({ ...p, [key]: dataURL }));
    setUploading((p) => ({ ...p, [key]: true }));
    try {
      await services.uploadFacePhoto(key, file, dataURL);
      // 성공 — 미리보기 유지
    } catch (e) {
      // 실패 — 미리보기 롤백 + 토스트
      setImages((p) => {
        const n = { ...p };
        delete n[key];
        return n;
      });
      const msg =
        e instanceof ApiError
          ? `${key} 업로드 실패 — ${e.message}`
          : `${key} 사진 업로드 실패. 다시 시도해주세요.`;
      toast.error(msg);
    } finally {
      setUploading((p) => {
        const n = { ...p };
        delete n[key];
        return n;
      });
    }
  };
  const handleRemove = (key) => {
    setImages((p) => {
      const n = { ...p };
      delete n[key];
      return n;
    });
  };

  // 5장 모두 업로드되고 백엔드 등록(=얼굴 벡터 추출)까지 끝나면(=업로드 in-flight 없음)
  // 잠시 뒤 자동으로 특징 추출 시각화 화면으로 이동한다. (1회만 — navedRef 가드)
  const navedRef = useRef(false);
  const allUploaded = completed === angles.length;
  const idle = Object.keys(uploading).length === 0;
  useEffect(() => {
    if (navedRef.current || !allUploaded || !idle) return;
    navedRef.current = true;
    const t = setTimeout(() => go("vectorExtract"), 1100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allUploaded, idle]);

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
          padding: "60px 56px 60px 56px",
          display: "grid",
          gridTemplateColumns: "1fr 1.1fr",
          gap: 80,
        }}
      >
        {/* LEFT: heading + progress */}
        <div>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 11,
              letterSpacing: "0.2em",
              color: T.muted,
              marginBottom: 28,
            }}
          >
            — 단계 02 / 02 — 얼굴 사진 5장 등록
          </div>

          <Bracket
            style={{
              fontSize: 42,
              lineHeight: 1.28,
              display: "block",
              marginBottom: 28,
              letterSpacing: "-0.005em",
            }}
          >
            다음의 각도 별
            <br />
            얼굴 사진을 등록해주세요
          </Bracket>

          <div
            style={{
              fontSize: 13,
              lineHeight: 1.7,
              color: T.inkSoft,
              maxWidth: 380,
              marginBottom: 56,
            }}
          >
            다양한 각도의 사진은 여러 환경에서 촬영된 이미지를 정확하게 식별하기
            위한 기준점이 됩니다. 등록된 사진은 종단 간 암호화되어 저장되며 분석
            외 다른 용도로 사용되지 않습니다.
          </div>

          {/* Progress */}
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: T.muted,
              marginBottom: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <span>— 등록 진행</span>
            <span style={{ fontFamily: FONT_SERIF, fontSize: 22, color: T.ink, letterSpacing: 0 }}>
              {completed}/{angles.length}
            </span>
          </div>
          <div
            style={{
              height: 1,
              background: T.rule,
              position: "relative",
              maxWidth: 380,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: -1,
                height: 3,
                width: `${pct}%`,
                background: T.green,
                transition: "width .4s ease",
              }}
            />
          </div>
        </div>

        {/* RIGHT: 5-angle capture slots + guidelines */}
        <div>
          {/* Angle slots */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 14,
              marginBottom: 18,
            }}
          >
            {angles.map((a) => (
              <AngleSlot
                key={a.key}
                angle={a}
                image={images[a.key]}
                onUpload={(d, f) => handleUpload(a.key, d, f)}
                onRemove={() => handleRemove(a.key)}
              />
            ))}
          </div>

          {/* Format + privacy meta */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              color: T.mutedSoft,
              letterSpacing: "0.06em",
              borderTop: `1px solid ${T.ruleSoft}`,
              borderBottom: `1px solid ${T.ruleSoft}`,
              padding: "12px 4px",
              marginBottom: 36,
              fontFamily: FONT_MONO,
            }}
          >
            <span>JPG · PNG · HEIC</span>
            <span>최대 10MB</span>
            <span>End-to-end 암호화</span>
          </div>

          {/* Guidelines */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              "정면을 응시하고 표정은 자연스럽게 유지해주세요",
              "안경 · 모자 · 마스크 등 얼굴을 가리는 액세서리를 제거해주세요",
              "조명이 균일한 환경에서 그림자가 지지 않게 촬영해주세요",
              "최근 6개월 이내의 사진을 사용해야 검출 정확도가 높아집니다",
            ].map((text, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "44px 1fr",
                  alignItems: "baseline",
                  gap: 16,
                  paddingBottom: 12,
                  borderBottom: `1px dotted ${T.rule}`,
                }}
              >
                <span
                  style={{
                    fontFamily: FONT_SERIF,
                    fontSize: 18,
                    color: T.muted,
                    letterSpacing: "0.04em",
                  }}
                >
                  · 0{i + 1}
                </span>
                <span style={{ fontSize: 13, color: T.inkSoft }}>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 56px 64px 56px",
        }}
      >
        <CtaGhost onClick={() => go("signup")}>← 이전 단계로</CtaGhost>
        <CtaPrimary
          onClick={() => completed === angles.length && go("vectorExtract")}
          style={{
            opacity: completed === angles.length ? 1 : 0.4,
            pointerEvents: completed === angles.length ? "auto" : "none",
          }}
        >
          <span>
            {completed === angles.length
              ? "5장 모두 등록 — 특징 추출"
              : `${angles.length - completed}장 더 등록해주세요`}
          </span>
          <span>→</span>
        </CtaPrimary>
      </div>
    </div>
  );
}

function HeadSilhouette({ angle, opacity = 0.55 }) {
  const key =
    angle === -90 ? "L90" :
    angle === -45 ? "L45" :
    angle === 45  ? "R45" :
    angle === 90  ? "R90" :
                    "F0";
  return (
    <img
      src={FACE_REFS[key]}
      alt=""
      draggable={false}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        opacity,
        userSelect: "none",
        pointerEvents: "none",
      }}
    />
  );
}

function AngleSlot({ angle, image, onUpload, onRemove }) {
  const inputRef = useRef(null);
  const [hover, setHover] = useState(false);
  const isDone = !!image;

  const openPicker = () => inputRef.current?.click();
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onUpload(reader.result, file);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div style={{ position: "relative", textAlign: "center" }}>
      {/* Photo frame */}
      <div
        onClick={openPicker}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          aspectRatio: "3 / 4",
          width: "100%",
          background: isDone ? T.bgDeep : T.paper,
          border: isDone
            ? `1.5px solid ${T.green}`
            : `1px dashed ${hover ? T.ink : T.mutedSoft}`,
          position: "relative",
          overflow: "hidden",
          cursor: "pointer",
          transition: "border-color .2s, background .2s, transform .15s",
          transform: hover && !isDone ? "translateY(-2px)" : "none",
        }}
      >
        {/* Corner ticks (camera-frame feel) */}
        <CornerTicks color={isDone ? T.green : T.mutedSoft} />

        {isDone ? (
          <>
            <img
              src={image}
              alt={angle.label}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
            {/* Replace / remove button on hover */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(19,17,12,0.55)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                opacity: hover ? 1 : 0,
                transition: "opacity .2s",
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openPicker();
                }}
                style={{
                  background: T.ctaInk,
                  color: T.cta,
                  border: "none",
                  padding: "6px 10px",
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  cursor: "pointer",
                  fontFamily: FONT_SANS,
                }}
              >
                교체
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                style={{
                  background: "transparent",
                  color: T.ctaInk,
                  border: `1px solid ${T.ctaInk}`,
                  padding: "6px 10px",
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  cursor: "pointer",
                  fontFamily: FONT_SANS,
                }}
              >
                삭제
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Faint silhouette example */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "12% 14% 18% 14%",
              }}
            >
              <HeadSilhouette
                angle={angle.deg}
                color={hover ? T.ink : T.muted}
                opacity={hover ? 0.34 : 0.22}
              />
            </div>

            {/* Upload hint at bottom */}
            <div
              style={{
                position: "absolute",
                bottom: 8,
                left: 0,
                right: 0,
                textAlign: "center",
                fontFamily: FONT_SANS,
                fontSize: 10,
                letterSpacing: "0.16em",
                color: hover ? T.ink : T.mutedSoft,
                textTransform: "uppercase",
                transition: "color .2s",
              }}
            >
              + 사진 등록
            </div>
          </>
        )}

        {/* Hidden file input */}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/heic,image/heif,image/*"
          onChange={handleFile}
          style={{ display: "none" }}
        />
      </div>

      {/* Label */}
      <div
        style={{
          fontFamily: FONT_SERIF,
          fontSize: 14,
          color: isDone ? T.ink : T.muted,
          marginTop: 10,
          letterSpacing: "0.02em",
        }}
      >
        {angle.label}
      </div>

      {/* Status */}
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: isDone ? T.green : T.mutedSoft,
          marginTop: 4,
          fontFamily: FONT_SANS,
        }}
      >
        {isDone ? "✓ 등록됨" : "대기"}
      </div>
    </div>
  );
}

function CornerTicks({ color }) {
  const len = 10;
  const off = 4;
  const lineProps = { stroke: color, strokeWidth: 1.2, fill: "none" };
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 1,
      }}
    >
      {/* TL */}
      <line x1={off} y1={off} x2={off + len} y2={off} {...lineProps} />
      <line x1={off} y1={off} x2={off} y2={off + len} {...lineProps} />
      {/* TR */}
      <line x1={100 - off} y1={off} x2={100 - off - len} y2={off} {...lineProps} />
      <line x1={100 - off} y1={off} x2={100 - off} y2={off + len} {...lineProps} />
      {/* BL */}
      <line x1={off} y1={100 - off} x2={off + len} y2={100 - off} {...lineProps} />
      <line x1={off} y1={100 - off} x2={off} y2={100 - off - len} {...lineProps} />
      {/* BR */}
      <line
        x1={100 - off}
        y1={100 - off}
        x2={100 - off - len}
        y2={100 - off}
        {...lineProps}
      />
      <line
        x1={100 - off}
        y1={100 - off}
        x2={100 - off}
        y2={100 - off - len}
        {...lineProps}
      />
    </svg>
  );
}
