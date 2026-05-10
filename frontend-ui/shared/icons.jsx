import React from "react";
import { T } from "../styles/tokens";

/**
 * Tiny line-art icons used in form fields (IconField slot prop).
 * All share the same 16×16 viewBox and inherit color from props.
 */
const IconBase = ({ children, size = 16, color = T.muted, strokeWidth = 1.3 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
  >
    {children}
  </svg>
);

export const IconMail = (p) => (
  <IconBase {...p}>
    <rect x="1.5" y="3" width="13" height="10" />
    <path d="M1.5 4 L8 9 L14.5 4" />
  </IconBase>
);

export const IconLock = (p) => (
  <IconBase {...p}>
    <rect x="3" y="7" width="10" height="7" />
    <path d="M5 7 V5 a3 3 0 0 1 6 0 V7" />
  </IconBase>
);

export const IconUser = (p) => (
  <IconBase {...p}>
    <circle cx="8" cy="5.5" r="2.5" />
    <path d="M2.5 14 Q 2.5 9, 8 9 Q 13.5 9, 13.5 14" />
  </IconBase>
);

export const IconCal = (p) => (
  <IconBase {...p}>
    <rect x="2" y="3.5" width="12" height="11" />
    <path d="M2 7 H14" />
    <path d="M5 2 V5 M11 2 V5" />
  </IconBase>
);

export const IconPhone = (p) => (
  <IconBase {...p}>
    <rect x="4.5" y="1.5" width="7" height="13" rx="1" />
    <line x1="7" y1="12.5" x2="9" y2="12.5" />
  </IconBase>
);

export const IconGlobe = (p) => (
  <IconBase {...p}>
    <circle cx="8" cy="8" r="6.5" />
    <path d="M1.5 8 H14.5" />
    <path d="M8 1.5 Q 4 8, 8 14.5 Q 12 8, 8 1.5" />
  </IconBase>
);

export const IconEye = (p) => (
  <IconBase {...p}>
    <path d="M1 8 Q 4 3, 8 3 Q 12 3, 15 8 Q 12 13, 8 13 Q 4 13, 1 8 Z" />
    <circle cx="8" cy="8" r="2" />
  </IconBase>
);

export const IconEyeOff = (p) => (
  <IconBase {...p}>
    <path d="M1 8 Q 4 3, 8 3 Q 12 3, 15 8 Q 12 13, 8 13 Q 4 13, 1 8 Z" />
    <line x1="2" y1="14" x2="14" y2="2" />
  </IconBase>
);

export const IconCheck = (p) => (
  <IconBase {...p} strokeWidth={1.6}>
    <path d="M3 8.5 L6.5 12 L13 4.5" />
  </IconBase>
);
