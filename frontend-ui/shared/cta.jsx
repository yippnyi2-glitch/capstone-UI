import React from "react";
import { T, FONT_SANS } from "../styles/tokens";

/**
 * Primary call-to-action button (filled dark, cream text).
 * Children are typically rendered as `<span>label</span><span>→</span>` so
 * `space-between` puts the arrow on the right edge.
 */
export function CtaPrimary({ children, onClick, full, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: T.cta,
        color: T.ctaInk,
        border: "none",
        padding: "16px 28px",
        fontFamily: FONT_SANS,
        fontSize: 13,
        letterSpacing: "0.1em",
        cursor: "pointer",
        width: full ? "100%" : "auto",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 36,
        transition: "transform .15s ease, opacity .15s ease",
        ...style,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
    >
      {children}
    </button>
  );
}

/** Outlined ghost button (used for back/secondary actions). */
export function CtaGhost({ children, onClick, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "transparent",
        color: T.ink,
        border: `1px solid ${T.ink}`,
        padding: "13px 24px",
        fontFamily: FONT_SANS,
        fontSize: 12,
        letterSpacing: "0.1em",
        cursor: "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/** Inline text link (looks like a link, behaves like a button). */
export function TextLink({ children, onClick, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        fontFamily: FONT_SANS,
        fontSize: 12,
        color: T.muted,
        cursor: "pointer",
        letterSpacing: "0.04em",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
