import React, { useState } from "react";
import { T, FONT_SERIF, FONT_SANS, FONT_MONO } from "../styles/tokens";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { ApiError, services } from "../services";
import { Bracket, TopLabel } from "../shared/layout";
import { CtaPrimary, CtaGhost, TextLink } from "../shared/cta";
import {
  GroupHeader, Badge, IconField, PwdStrengthBar, SegmentedControl,
} from "../shared/form";
import {
  IconMail, IconLock, IconUser, IconCal, IconEye, IconEyeOff, IconCheck,
} from "../shared/icons";
import { pwdStrength, isEmailValid, isBirthValid } from "../shared/utils";

export default function SignupScreen({ go }) {
  const auth = useAuth();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [emailCheck, setEmailCheck] = useState(null); // null | 'checking' | 'ok' | 'taken'
  const [emailError, setEmailError] = useState(null);

  const [pwd, setPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [pwd2, setPwd2] = useState("");
  const [showPwd2, setShowPwd2] = useState(false);

  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [gender, setGender] = useState("");

  const strength = pwdStrength(pwd);
  const pwdMatch = pwd2.length > 0 && pwd === pwd2;
  const pwdMismatch = pwd2.length > 0 && pwd !== pwd2;

  const emailValid = isEmailValid(email);
  const birthValid = isBirthValid(birth);

  const handleEmailCheck = async () => {
    if (!emailValid) return;
    setEmailCheck("checking");
    setEmailError(null);
    try {
      await services.checkEmailDuplicate(email);
      setEmailCheck("ok");
    } catch (e) {
      setEmailCheck("taken");
      // ApiError pattern: pull field-level error message when available
      if (e instanceof ApiError && e.fieldErrors?.email) {
        setEmailError(e.fieldErrors.email);
      } else {
        setEmailError("확인 중 오류가 발생했습니다");
      }
    }
  };

  const allValid =
    emailCheck === "ok" &&
    strength >= 3 &&
    pwdMatch &&
    name.trim().length >= 2 &&
    birthValid &&
    gender;

  return (
    <div style={{ backgroundColor: T.bg, minHeight: "100vh" }}>
      <TopLabel
        left={[
          { label: "이용 약관", active: false },
          { label: "기본 정보", active: true },
          { label: "얼굴 등록", active: false },
        ]}
        right="회원가입"
      />

      <div style={{ padding: "60px 56px 140px 56px", maxWidth: 760 }}>
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            letterSpacing: "0.2em",
            color: T.muted,
            marginBottom: 28,
          }}
        >
          — 단계 01 / 02 — 기본 정보 입력
        </div>

        <Bracket
          style={{
            fontSize: 44,
            lineHeight: 1.25,
            display: "block",
            marginBottom: 8,
            letterSpacing: "-0.005em",
          }}
        >
          서비스에 접속하여
          <br />
          딥페이크 이미지를 탐지해보세요
        </Bracket>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 24 }}>
          필수 항목을 모두 입력해야 다음 단계로 진행할 수 있습니다.
        </div>

        {/* === 그룹 A: 계정 정보 === */}
        <GroupHeader>계정 정보</GroupHeader>

        <IconField
          icon={IconMail}
          label="이메일 주소 (ID)"
          required
          inputProps={{
            value: email,
            onChange: (e) => {
              setEmail(e.target.value);
              setEmailCheck(null);
              setEmailError(null);
            },
            placeholder: "you@example.com",
            type: "email",
          }}
          trailing={
            <button
              onClick={handleEmailCheck}
              disabled={!emailValid || emailCheck === "checking"}
              style={{
                background: emailValid ? T.ink : "transparent",
                color: emailValid ? T.ctaInk : T.mutedSoft,
                border: `1px solid ${emailValid ? T.ink : T.rule}`,
                padding: "7px 14px",
                fontFamily: FONT_SANS,
                fontSize: 11,
                letterSpacing: "0.08em",
                cursor: emailValid ? "pointer" : "not-allowed",
                whiteSpace: "nowrap",
              }}
            >
              {emailCheck === "checking" ? "확인 중…" : "중복 확인"}
            </button>
          }
          error={
            emailError
              ? emailError
              : email && !emailValid
              ? "이메일 형식이 올바르지 않습니다"
              : null
          }
          success={emailCheck === "ok" ? "사용 가능한 이메일입니다" : null}
          hint={!email ? "본인 확인 및 알림 발송에 사용됩니다" : null}
        />

        <IconField
          icon={IconLock}
          label="비밀번호"
          required
          inputProps={{
            value: pwd,
            onChange: (e) => setPwd(e.target.value),
            placeholder: "최소 10자 이상",
            type: showPwd ? "text" : "password",
          }}
          trailing={
            <button
              onClick={() => setShowPwd((v) => !v)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 4,
                display: "flex",
              }}
              aria-label="비밀번호 표시 전환"
            >
              {showPwd ? <IconEyeOff color={T.muted} /> : <IconEye color={T.muted} />}
            </button>
          }
          hint="영문 대소문자 · 숫자 · 특수문자 조합 권장"
        />
        {pwd && <PwdStrengthBar value={strength} />}

        <div style={{ height: 24 }} />

        <IconField
          icon={IconLock}
          label="비밀번호 확인"
          required
          inputProps={{
            value: pwd2,
            onChange: (e) => setPwd2(e.target.value),
            placeholder: "다시 입력",
            type: showPwd2 ? "text" : "password",
          }}
          trailing={
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {pwdMatch && <IconCheck color={T.green} />}
              <button
                onClick={() => setShowPwd2((v) => !v)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 4,
                  display: "flex",
                }}
                aria-label="비밀번호 표시 전환"
              >
                {showPwd2 ? <IconEyeOff color={T.muted} /> : <IconEye color={T.muted} />}
              </button>
            </div>
          }
          error={pwdMismatch ? "비밀번호가 일치하지 않습니다" : null}
          success={pwdMatch ? "일치합니다" : null}
        />

        {/* === 그룹 B: 본인 정보 === */}
        <GroupHeader>본인 정보</GroupHeader>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
          <IconField
            icon={IconUser}
            label="이름"
            required
            inputProps={{
              value: name,
              onChange: (e) => setName(e.target.value),
              placeholder: "홍길동",
            }}
          />
          <IconField
            icon={IconCal}
            label="생년월일"
            required
            inputProps={{
              value: birth,
              onChange: (e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 8);
                setBirth(v);
              },
              placeholder: "YYYYMMDD",
              inputMode: "numeric",
            }}
            error={birth.length === 8 && !birthValid ? "유효하지 않거나 만 14세 미만입니다" : null}
            hint={birth.length < 8 ? "숫자 8자리" : null}
            meta={birth ? `${birth.length}/8` : null}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: T.muted,
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
            }}
          >
            <span>성별</span>
            <Badge required />
          </div>
          <SegmentedControl
            value={gender}
            onChange={setGender}
            options={[
              { value: "m", label: "남자" },
              { value: "f", label: "여자" },
              { value: "x", label: "선택 안 함" },
            ]}
          />
        </div>
      </div>

      {/* Sticky bottom CTA bar */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: T.bg,
          borderTop: `1px solid ${T.rule}`,
          padding: "16px 56px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backdropFilter: "blur(4px)",
          zIndex: 5,
        }}
      >
        <CtaGhost onClick={() => go("login")}>← 이전 단계</CtaGhost>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 11,
            color: T.muted,
            letterSpacing: "0.06em",
          }}
        >
          {!allValid && (
            <span>{allValid ? "" : "필수 항목을 모두 입력해주세요"}</span>
          )}
          <CtaPrimary
            onClick={async () => {
              if (!allValid) return;
              try {
                await auth.signup({ email, password: pwd, name, birth, gender });
                go("capture");
              } catch (e) {
                if (e instanceof ApiError && e.fieldErrors?.email) {
                  setEmailError(e.fieldErrors.email);
                  setEmailCheck("taken");
                  toast.error(e.message);
                } else {
                  toast.error(
                    e instanceof ApiError ? e.message : "회원가입에 실패했습니다"
                  );
                }
              }
            }}
            style={{
              opacity: allValid ? 1 : 0.4,
              pointerEvents: allValid ? "auto" : "none",
            }}
          >
            <span>다음 — 얼굴 등록</span>
            <span>→</span>
          </CtaPrimary>
        </div>
      </div>
    </div>
  );
}
