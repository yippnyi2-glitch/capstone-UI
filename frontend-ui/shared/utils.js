/* ============================================================
   Pure utility functions — no React, no DOM, fully testable.
   ============================================================ */

/** Sleep for `ms` milliseconds (used in mock service delays). */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Format a number with thousands separators (en-US). */
export const fmt = (n) => n.toLocaleString("en-US");

/**
 * Format a Date as "YYYY.MM.DD HH:mm KST" for display in section headers.
 * (Treats the local time as KST since this is a Korean app context.)
 */
export const fmtKstTimestamp = (d) => {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())} KST`
  );
};

/** Generate a receipt ID like "RCP-YYYY-MM-DD-HHmm" from a Date. */
export const fmtReceiptId = (d) => {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `RCP-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}`
  );
};

/** Format a Date as "YYYY.MM.DD HH:mm:ss" for the receipt sentAt field. */
export const fmtReceiptTime = (d) => {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
};

/* ---------- Form validation helpers ---------- */

/** Compute password strength on a 0–5 scale based on length and char classes. */
export function pwdStrength(p) {
  if (!p) return 0;
  let s = 0;
  if (p.length >= 10) s++;
  if (/[a-z]/.test(p)) s++;
  if (/[A-Z]/.test(p)) s++;
  if (/[0-9]/.test(p)) s++;
  if (/[^a-zA-Z0-9]/.test(p)) s++;
  return s;
}

/** Returns true if the email looks valid (lightweight regex). */
export function isEmailValid(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/** Format a digit string into Korean phone format like "010-1234-5678". */
export function formatPhone(v) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

/**
 * Validate birth string (8 digits, YYYYMMDD).
 * Requires year 1910–2099, valid month/day, and age ≥ 14.
 */
export function isBirthValid(b) {
  if (b.length !== 8) return false;
  const y = +b.slice(0, 4);
  const m = +b.slice(4, 6);
  const d = +b.slice(6, 8);
  if (y < 1910 || y > 2099) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  // age >= 14
  const today = new Date();
  const dob = new Date(y, m - 1, d);
  const age = (today - dob) / (1000 * 60 * 60 * 24 * 365.25);
  return age >= 14;
}
