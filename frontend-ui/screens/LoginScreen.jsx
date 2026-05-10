import React, { useState } from "react";
import { T, FONT_SERIF, FONT_SANS, FONT_MONO, grainBg } from "../styles/tokens";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { ApiError } from "../services";
import { Bracket } from "../shared/layout";
import { CtaPrimary, CtaGhost, TextLink } from "../shared/cta";
import { FieldLabel, BareInput } from "../shared/form";

export default function LoginScreen({ go }) {
  const auth = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const onLogin = async () => {
    if (!email || !pwd) return;
    setLoading(true);
    setError(null);
    try {
      await auth.login(email, pwd);
      go("welcome");
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : "로그인에 실패했습니다";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", backgroundColor: T.bg }}>
      <div
        style={{
          padding: "20px 56px 0 56px",
          fontFamily: FONT_SANS,
          fontSize: 11,
          letterSpacing: "0.18em",
          color: T.muted,
          textTransform: "uppercase",
        }}
      >
        — 메인 / 로그인
      </div>

      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1px 1fr",
          alignItems: "stretch",
          padding: "0 56px",
        }}
      >
        {/* LEFT: brand slogan */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            paddingRight: 64,
          }}
        >
          <div>
            <Bracket
              style={{
                fontSize: 54,
                lineHeight: 1.25,
                letterSpacing: "-0.01em",
                color: T.ink,
                fontWeight: 400,
                display: "inline-block",
              }}
            >
              비동의 딥페이크
              <br />
              사진 삭제 요청
              <br />
              시스템
            </Bracket>
          </div>
        </div>

        {/* DIVIDER */}
        <div style={{ background: T.rule, alignSelf: "stretch" }} />

        {/* RIGHT: login form */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            paddingLeft: 88,
          }}
        >
          <div style={{ width: "100%", maxWidth: 360 }}>
            <Bracket
              style={{
                fontSize: 32,
                fontWeight: 400,
                letterSpacing: "-0.01em",
                display: "block",
                marginBottom: 12,
              }}
            >
              로그인
            </Bracket>
            <div style={{ marginBottom: 36, color: T.muted, fontSize: 13 }}>
              탐지 결과와 처리 현황을 이어서 확인하세요
            </div>

            <FieldLabel>이메일</FieldLabel>
            <BareInput
              placeholder="you@example.com"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <div style={{ height: 28 }} />

            <FieldLabel>비밀번호</FieldLabel>
            <BareInput
              placeholder="••••••••"
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onLogin()}
            />

            {error && (
              <div
                style={{
                  marginTop: 12,
                  fontSize: 12,
                  color: T.warn,
                  letterSpacing: "0.04em",
                }}
              >
                {error}
              </div>
            )}

            <div style={{ height: 36 }} />

            <CtaPrimary full onClick={onLogin}>
              <span>{loading ? "로그인 중…" : "로그인"}</span>
              <span>→</span>
            </CtaPrimary>

            <div
              style={{
                marginTop: 32,
                marginBottom: 16,
                textAlign: "center",
                fontSize: 11,
                letterSpacing: "0.16em",
                color: T.mutedSoft,
                textTransform: "uppercase",
              }}
            >
              — 처음이신가요 —
            </div>

            <CtaGhost
              style={{ width: "100%", padding: "14px 24px" }}
              onClick={() => go("signup")}
            >
              회원가입 시작하기
            </CtaGhost>

            <div
              style={{
                marginTop: 56,
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
                color: T.mutedSoft,
                letterSpacing: "0.04em",
              }}
            >
              <TextLink>비밀번호 찾기</TextLink>
              <span style={{ fontFamily: FONT_MONO }}>End-to-end 암호화</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
