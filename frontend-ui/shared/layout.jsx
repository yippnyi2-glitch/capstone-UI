import React from "react";
import { T, FONT_SERIF, FONT_SANS } from "../styles/tokens";

/**
 * Decorative serif brackets [ around content ].
 * Used for headlines and small editorial labels throughout the app.
 */
export const Bracket = ({ children, style }) => (
  <span style={{ fontFamily: FONT_SERIF, ...style }}>
    <span style={{ opacity: 0.55 }}>[</span>
    {children}
    <span style={{ opacity: 0.55 }}>]</span>
  </span>
);

/**
 * Top breadcrumb header. `left` can be a string or an array of
 * { label, active } items rendered as a step indicator.
 */
export function TopLabel({ left, right }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontFamily: FONT_SANS,
        fontSize: 11,
        letterSpacing: "0.18em",
        color: T.muted,
        textTransform: "uppercase",
        padding: "20px 56px 0 56px",
      }}
    >
      <div style={{ display: "flex", gap: 20 }}>
        {Array.isArray(left)
          ? left.map((l, i) => (
              <span
                key={i}
                style={{
                  color: l.active ? T.ink : T.mutedSoft,
                  borderBottom: l.active ? `1px solid ${T.ink}` : "none",
                  paddingBottom: 2,
                }}
              >
                {l.label}
              </span>
            ))
          : left}
      </div>
      <div style={{ color: T.mutedSoft }}>{right}</div>
    </div>
  );
}
