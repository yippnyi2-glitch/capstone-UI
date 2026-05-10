import React, { useState } from "react";
import { T, FONT_SERIF, FONT_SANS, FONT_MONO } from "../styles/tokens";

/**
 * Small uppercase field label for free-floating fields.
 * Accepts an optional secondary `hint` rendered on the right side.
 */
export function FieldLabel({ children, hint }) {
  return (
    <div
      style={{
        fontSize: 11,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: T.muted,
        marginBottom: 10,
        display: "flex",
        justifyContent: "space-between",
      }}
    >
      <span>{children}</span>
      {hint && <span style={{ color: T.mutedSoft }}>{hint}</span>}
    </div>
  );
}

/**
 * Minimal underlined input. Accepts all standard `<input>` props.
 * Used for plain fields that don't need an icon or label slot.
 */
export function BareInput({ style, ...props }) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        background: "transparent",
        border: "none",
        borderBottom: `1px solid ${T.rule}`,
        padding: "10px 0",
        fontFamily: FONT_SANS,
        fontSize: 16,
        color: T.ink,
        outline: "none",
        ...style,
      }}
      onFocus={(e) => (e.target.style.borderBottomColor = T.ink)}
      onBlur={(e) => (e.target.style.borderBottomColor = T.rule)}
    />
  );
}

/**
 * Section divider header used in SignupScreen to group related fields.
 * Renders a serif title with an optional small hint, plus a thin rule beneath.
 */
export function GroupHeader({ children, hint }) {
  return (
    <div style={{ marginTop: 48, marginBottom: 22 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontFamily: FONT_SERIF,
            fontSize: 18,
            color: T.ink,
            letterSpacing: "0.02em",
          }}
        >
          {children}
        </span>
        {hint && (
          <span style={{ fontSize: 11, color: T.mutedSoft, letterSpacing: "0.06em" }}>
            {hint}
          </span>
        )}
      </div>
      <div style={{ height: 1, background: T.rule }} />
    </div>
  );
}

/**
 * Tiny pill badge — "필수" (green) or "선택" (muted), used next to field labels.
 */
export function Badge({ required }) {
  return (
    <span
      style={{
        fontSize: 9,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: required ? T.green : T.mutedSoft,
        border: `1px solid ${required ? T.green : T.mutedSoft}`,
        padding: "2px 6px",
        marginLeft: 8,
        verticalAlign: "middle",
      }}
    >
      {required ? "필수" : "선택"}
    </span>
  );
}

/**
 * The flagship form field. Includes:
 *   - leading icon (Icon component from shared/icons)
 *   - label + required/optional Badge
 *   - input
 *   - optional trailing slot (button, eye toggle, etc.)
 *   - hint / error / success message + optional `meta` (right-side counter)
 *
 * Border color shifts to T.ink (focus), T.warn (error), T.green (success).
 */
export function IconField({
  icon: Icon,
  label,
  required,
  hint,
  error,
  success,
  trailing,
  inputProps = {},
  meta,
}) {
  const [focused, setFocused] = useState(false);
  const borderColor = error
    ? T.warn
    : success
    ? T.green
    : focused
    ? T.ink
    : T.rule;
  return (
    <div style={{ marginBottom: 24 }}>
      {label && (
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: T.muted,
            marginBottom: 8,
            display: "flex",
            alignItems: "center",
          }}
        >
          <span>{label}</span>
          {required !== undefined && <Badge required={required} />}
        </div>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderBottom: `1px solid ${borderColor}`,
          padding: "8px 0",
          transition: "border-color .15s",
        }}
      >
        {Icon && <Icon color={focused ? T.ink : T.muted} />}
        <input
          {...inputProps}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            fontFamily: FONT_SANS,
            fontSize: 15,
            color: T.ink,
            padding: "2px 0",
            ...(inputProps.style || {}),
          }}
        />
        {trailing}
      </div>
      {(hint || error || success || meta) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 6,
            fontSize: 11,
            color: error ? T.warn : success ? T.green : T.mutedSoft,
            letterSpacing: "0.04em",
          }}
        >
          <span>{error || success || hint}</span>
          {meta && <span style={{ fontFamily: FONT_MONO, color: T.mutedSoft }}>{meta}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * 5-segment password strength bar.
 *
 * @param {{ value: number }} props  value is 0–5 (use pwdStrength() from utils).
 */
export function PwdStrengthBar({ value }) {
  const labels = ["", "매우 약함", "약함", "보통", "강함", "매우 강함"];
  const colors = [T.rule, T.warn, T.warn, T.mutedSoft, T.greenSoft, T.green];
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        alignItems: "center",
        marginTop: 8,
      }}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: 2,
            background: i <= value ? colors[value] : T.rule,
            transition: "background .25s",
          }}
        />
      ))}
      <span
        style={{
          fontSize: 11,
          color: colors[value] === T.rule ? T.mutedSoft : colors[value],
          letterSpacing: "0.06em",
          marginLeft: 8,
          minWidth: 56,
          textAlign: "right",
        }}
      >
        {labels[value] || "—"}
      </span>
    </div>
  );
}

/**
 * Mutually-exclusive button group. Used for gender selection in SignupScreen.
 *
 * @param {{ options: {value:string,label:string}[], value: string, onChange: (v:string)=>void }} props
 */
export function SegmentedControl({ options, value, onChange }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${options.length}, 1fr)`,
        border: `1px solid ${T.rule}`,
      }}
    >
      {options.map((opt, i) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              padding: "12px 0",
              background: active ? T.ink : "transparent",
              color: active ? T.ctaInk : T.ink,
              fontFamily: FONT_SANS,
              fontSize: 13,
              letterSpacing: "0.04em",
              cursor: "pointer",
              border: "none",
              borderLeft: i === 0 ? "none" : `1px solid ${T.rule}`,
              transition: "background .15s",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Square checkbox button.
 * Used in ResultsScreen (per-row selection) and ConsentItem (review consents).
 */
export function Checkbox({ checked, onChange, size = 18 }) {
  return (
    <button
      onClick={onChange}
      aria-checked={checked}
      role="checkbox"
      style={{
        width: size,
        height: size,
        border: `1px solid ${checked ? T.green : T.muted}`,
        background: checked ? T.green : "transparent",
        color: T.ctaInk,
        cursor: "pointer",
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        lineHeight: 1,
      }}
    >
      {checked ? "✓" : ""}
    </button>
  );
}
