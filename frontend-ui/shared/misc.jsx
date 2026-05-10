import React from "react";
import { T, FONT_SERIF, FONT_MONO } from "../styles/tokens";

/**
 * Compact user identity badge — circular initial + name + reference code.
 * Used in WelcomeScreen header and StatusScreen header.
 */
export function UserBadge({ name, refCode }) {
  return (
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
        {name?.[0] || "U"}
      </div>
      <div>
        <div style={{ fontWeight: 500, color: T.ink }}>{name}</div>
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 10,
            color: T.muted,
            letterSpacing: "0.04em",
          }}
        >
          {refCode}
        </div>
      </div>
    </div>
  );
}

/**
 * Privacy-protective placeholder thumbnail shown in match rows
 * (ResultsScreen, ReviewScreen). Diagonal stripe pattern + "BLURRED" label.
 *
 * In production, replace with an actual blurred preview from the backend
 * (e.g. server-side blurred via image proxy) — same visual API.
 */
export function BlurredThumb({ size = 60 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        position: "relative",
        background: T.bgDeep,
        overflow: "hidden",
        border: `1px solid ${T.ruleSoft}`,
      }}
    >
      <svg
        viewBox="0 0 60 60"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        <defs>
          <pattern
            id="stripe"
            patternUnits="userSpaceOnUse"
            width="6"
            height="6"
            patternTransform="rotate(45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              stroke={T.mutedSoft}
              strokeWidth="1"
              opacity="0.5"
            />
          </pattern>
        </defs>
        <rect width="60" height="60" fill="url(#stripe)" />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONT_MONO,
          fontSize: 8,
          letterSpacing: "0.18em",
          color: T.muted,
        }}
      >
        BLURRED
      </div>
    </div>
  );
}
