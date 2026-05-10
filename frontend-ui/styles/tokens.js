import { useEffect } from "react";

/* ---------- Design tokens (single source of truth) ---------- */
export const T = {
  bg: "#F4EEDC",
  bgDeep: "#EDE5CE",
  paper: "#FAF5E5",
  ink: "#1B1812",
  inkSoft: "#3A352B",
  muted: "#8A8270",
  mutedSoft: "#B0A78F",
  rule: "#DDD5BE",
  ruleSoft: "#E8E1CB",
  green: "#1E4534",
  greenSoft: "#3B5F4D",
  greenPale: "#C7D3CB",
  warn: "#A14A2A",
  cta: "#13110C",
  ctaInk: "#F4EEDC",
};

export const FONT_SERIF =
  "'Nanum Myeongjo', 'Noto Serif KR', 'Source Han Serif KR', ui-serif, Georgia, serif";
export const FONT_SANS =
  "'Pretendard', 'Noto Sans KR', -apple-system, BlinkMacSystemFont, ui-sans-serif, system-ui, sans-serif";
export const FONT_MONO =
  "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

/* ---------- Inject Google Fonts + force light scheme + body bg ---------- */
export function useFonts() {
  useEffect(() => {
    const id = "fdr-fonts";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&family=Noto+Serif+KR:wght@400;500;700;900&family=Noto+Sans+KR:wght@300;400;500;700&family=JetBrains+Mono:wght@400;500&display=swap";
      document.head.appendChild(link);
    }

    // Force light color-scheme + cream background on html/body so the
    // app never inherits a dark surface from the host container.
    const styleId = "fdr-base-style";
    if (!document.getElementById(styleId)) {
      const s = document.createElement("style");
      s.id = styleId;
      s.textContent = `
        :root { color-scheme: light only; }
        html, body, #root {
          background-color: #F4EEDC !important;
          color: #1B1812;
          margin: 0;
        }
      `;
      document.head.appendChild(s);
    }

    document.documentElement.style.setProperty("background-color", "#F4EEDC", "important");
    document.body.style.setProperty("background-color", "#F4EEDC", "important");
    document.documentElement.style.setProperty("color-scheme", "light", "important");
  }, []);
}

/* ---------- Subtle paper grain (SVG data URI) ---------- */
export const grainBg = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'>
    <filter id='n'>
      <feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/>
      <feColorMatrix values='0 0 0 0 0.42  0 0 0 0 0.36  0 0 0 0 0.26  0 0 0 0.018 0'/>
    </filter>
    <rect width='100%' height='100%' filter='url(%23n)'/>
  </svg>`
)}")`;
