// Formatting money for display, and parsing what people type into amount fields.
import { round2 } from '/lib/calc.js';

const orDash = (f) => (v) => (v === null || v === undefined ? '—' : f(v));
export const fmt = orDash((v) => (round2(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const usd = orDash((v) => (v < 0 ? '-$' : '$') + fmt(Math.abs(v)));
export const pct = orDash((v) => `${(v * 100).toFixed(2)}%`);

// Amount inputs show the raw number while editing (amtText) and 1,234.50 otherwise (amtShow). Blank stays blank.
export const amtText = (v) => (v === null || v === undefined ? '' : String(v));
export const amtShow = (v) => (v === null || v === undefined ? '' : fmt(v));

// A number for storage: rounded to cents, or null when missing or not finite.
export const toMoney = (v) => (Number.isFinite(v) ? round2(v) : null);
// A number input's value, or null when it is empty.
export const inputNum = (el) => (el.value === '' ? null : Number(el.value));

// + - * / and parentheses. A small parser instead of eval, so the page runs under a strict CSP.
function arith(s) {
  let i = 0;
  const fail = () => { throw new Error('bad expression'); };
  const num = () => { const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i)); if (!m) fail(); i += m[0].length; return Number(m[0]); };
  const factor = () => {
    if (s[i] === '+' || s[i] === '-') { const neg = s[i++] === '-'; const v = factor(); return neg ? -v : v; }
    if (s[i] === '(') { i++; const v = expr(); if (s[i++] !== ')') fail(); return v; }
    return num();
  };
  const term = () => { let v = factor(); while (s[i] === '*' || s[i] === '/') v = s[i++] === '*' ? v * factor() : v / factor(); return v; };
  const expr = () => { let v = term(); while (s[i] === '+' || s[i] === '-') v = s[i++] === '+' ? v + term() : v - term(); return v; };
  const v = expr();
  if (i !== s.length) fail();
  return v;
}

// Numbers with $ and commas, or a formula like =1+2. Returns { ok, v } where v is null for a blank input.
export function parseAmount(raw) {
  let s = String(raw).trim().replace(/[$,\s]/g, '');
  if (!s) return { ok: true, v: null };
  if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return { ok: true, v: round2(Number(s)) };
  if (s.startsWith('=')) s = s.slice(1);
  if (!/^[-+*/().\d]+$/.test(s)) return { ok: false };
  try {
    const v = toMoney(arith(s));
    return v === null ? { ok: false } : { ok: true, v };
  } catch { return { ok: false }; }
}
