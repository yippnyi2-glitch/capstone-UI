import React, { useState } from "react";
import { T, FONT_SANS, FONT_MONO, grainBg, useFonts } from "./styles/tokens";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";

import LoginScreen from "./screens/LoginScreen";
import SignupScreen from "./screens/SignupScreen";
import CaptureScreen from "./screens/CaptureScreen";
import VectorExtractScreen from "./screens/VectorExtractScreen";
import WelcomeScreen from "./screens/WelcomeScreen";
import AnalyzingScreen from "./screens/AnalyzingScreen";
import ResultsScreen from "./screens/ResultsScreen";
import ReviewScreen from "./screens/ReviewScreen";
import SentScreen from "./screens/SentScreen";
import StatusScreen from "./screens/StatusScreen";

/**
 * Top-level app: wires global providers (Toast, Auth) around the screen router.
 * Mount this from your bundler entry, e.g.:
 *   import App from "./src/App";
 *   createRoot(document.getElementById("root")).render(<App />);
 */
export default function FaceDeletionApp() {
  useFonts();
  return (
    <ToastProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </ToastProvider>
  );
}

/**
 * Screen router. Holds the small pieces of cross-screen state that need to
 * survive a screen change (current screen name, selected match IDs, last
 * deletion receipt). Each screen receives `go(name)` to navigate.
 */
function AppInner() {
  const [screen, setScreen] = useState("login");
  // login | signup | capture | vectorExtract | welcome | analyzing | results | review | sent | status

  const [selected, setSelected] = useState([]);
  /** @type {[import("./services").RequestReceipt|null, Function]} */
  const [receipt, setReceipt] = useState(null);

  const go = (s) => {
    setScreen(s);
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };

  const wrapStyle = {
    position: "fixed",
    inset: 0,
    overflowY: "auto",
    overflowX: "hidden",
    backgroundColor: T.bg,
    backgroundImage: grainBg,
    backgroundRepeat: "repeat",
    color: T.ink,
    fontFamily: FONT_SANS,
    colorScheme: "light",
  };

  const innerStyle = {
    backgroundColor: T.bg,
    minHeight: "100vh",
    width: "100%",
  };

  return (
    <div style={wrapStyle}>
      <div style={innerStyle}>
        {screen === "login" && <LoginScreen go={go} />}
        {screen === "signup" && <SignupScreen go={go} />}
        {screen === "capture" && <CaptureScreen go={go} />}
        {screen === "vectorExtract" && <VectorExtractScreen go={go} />}
        {screen === "welcome" && <WelcomeScreen go={go} />}
        {screen === "analyzing" && <AnalyzingScreen go={go} />}
        {screen === "results" && (
          <ResultsScreen go={go} selected={selected} setSelected={setSelected} />
        )}
        {screen === "review" && (
          <ReviewScreen go={go} selected={selected} setReceipt={setReceipt} />
        )}
        {screen === "sent" && <SentScreen go={go} receipt={receipt} />}
        {screen === "status" && <StatusScreen go={go} />}
      </div>

      {/* Dev helper: bottom-right screen jumper. Remove for production. */}
      <DevPager screen={screen} go={go} />
    </div>
  );
}

/**
 * Dev-only screen jumper (small, unobtrusive). Lets you skip directly to any
 * of the 10 screens for testing without going through the full flow.
 *
 * To remove for production: just delete the `<DevPager />` line above.
 */
function DevPager({ screen, go }) {
  const screens = [
    ["login", "01"],
    ["signup", "02"],
    ["capture", "03"],
    ["vectorExtract", "04"],
    ["welcome", "05"],
    ["analyzing", "06"],
    ["results", "07"],
    ["review", "08"],
    ["sent", "09"],
    ["status", "10"],
  ];
  return (
    <div
      style={{
        position: "fixed",
        bottom: 18,
        right: 18,
        background: "rgba(27,24,18,0.92)",
        color: T.ctaInk,
        padding: "8px 10px",
        fontFamily: FONT_MONO,
        fontSize: 10,
        letterSpacing: "0.08em",
        display: "flex",
        gap: 4,
        borderRadius: 2,
        zIndex: 50,
      }}
    >
      <span style={{ opacity: 0.55, marginRight: 6 }}>SCREEN</span>
      {screens.map(([s, n]) => (
        <button
          key={s}
          onClick={() => go(s)}
          style={{
            background: screen === s ? T.ctaInk : "transparent",
            color: screen === s ? T.cta : T.ctaInk,
            border: `1px solid ${screen === s ? T.ctaInk : "rgba(236,229,211,0.3)"}`,
            padding: "2px 6px",
            fontFamily: FONT_MONO,
            fontSize: 10,
            cursor: "pointer",
            borderRadius: 1,
          }}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
