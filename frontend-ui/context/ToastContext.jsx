import React, { useState } from "react";
import { T, FONT_SANS } from "../styles/tokens";

/**
 * Toast notification system. Components use:
 *   const toast = useToast();
 *   toast.error("메시지");
 *   toast.success("저장됨");
 *   toast.info("...");
 *
 * Toasts appear in the top-right and auto-dismiss after ~4 seconds.
 * Click a toast to dismiss it immediately.
 */
export const ToastContext = React.createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = (id) =>
    setToasts((arr) => arr.filter((t) => t.id !== id));

  const push = (message, kind) => {
    const id = Date.now() + Math.random();
    setToasts((arr) => [...arr, { id, message, kind }]);
    setTimeout(() => dismiss(id), 4000);
  };

  const api = {
    info:    (m) => push(m, "info"),
    success: (m) => push(m, "success"),
    error:   (m) => push(m, "error"),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/** Renders the stack of active toasts in a fixed top-right position. */
function ToastViewport({ toasts, onDismiss }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 24,
        right: 24,
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => {
        const palette =
          t.kind === "error"
            ? { bg: T.warn, fg: T.ctaInk }
            : t.kind === "success"
            ? { bg: T.green, fg: T.ctaInk }
            : { bg: T.cta, fg: T.ctaInk };
        return (
          <div
            key={t.id}
            onClick={() => onDismiss(t.id)}
            style={{
              background: palette.bg,
              color: palette.fg,
              padding: "12px 18px",
              fontFamily: FONT_SANS,
              fontSize: 13,
              letterSpacing: "0.04em",
              minWidth: 280,
              maxWidth: 420,
              cursor: "pointer",
              pointerEvents: "auto",
              boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
              animation: "fdr-toast-in .25s ease",
            }}
          >
            <style>{`
              @keyframes fdr-toast-in {
                from { transform: translateX(20px); opacity: 0; }
                to   { transform: translateX(0); opacity: 1; }
              }
            `}</style>
            {t.message}
          </div>
        );
      })}
    </div>
  );
}

/** Hook for any component inside ToastProvider to fire toasts. */
export const useToast = () => {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
};
