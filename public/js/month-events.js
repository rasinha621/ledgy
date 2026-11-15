// Editing on the month tab: typing amounts and labels, adding and deleting rows, quick-add on collapsed cards,
// keyboard navigation between rows, pasting columns from a spreadsheet, and the chart toggles.
import { n } from '/lib/calc.js';
import { $, onActivate } from './dom.js';
import { parseAmount, amtText, amtShow } from './format.js';
import { state, onSummary, curMonth } from './state.js';
import { isGroup, findList, rowsOf, newRow, linkedList } from './lists.js';
import { scheduleSave } from './save.js';
import { rowCtx, focusRow, linkedValue, renderMonth, refresh, replaceCard, toggleCard, toggleDonut } from './month.js';
import { setLink, showPop, hidePop, popKeydown } from './picker.js';
import { setTab } from './render.js';
import { openListDialog, deleteList } from './dialogs.js';
import { openImport, openNew } from './year-dialogs.js';
import { openSettings } from './settings.js';

const isAmt = (t) => t.classList.contains('amt');
const isLbl = (t) => t.classList.contains('lbl');
const markBad = (t, bad) => { t.style.color = bad ? 'var(--over)' : ''; };

function onInput(e) {
  const t = e.target;
  if (t.classList.contains('qa-amt')) { markBad(t, false); return; }
  const ctx = rowCtx(t); if (!ctx) return;
  const { row } = ctx;
  if (isAmt(t)) {
    if (isGroup(ctx.sec)) {
      showPop(t);
      const hit = findList(t.value, ctx.sec);
      if (hit) { setLink(t, row, hit.key); return; }
    }
    const p = parseAmount(t.value);
    markBad(t, !p.ok);
    if (!p.ok) return;
    row.amount = p.v; t.classList.toggle('neg', n(p.v) < 0);
    if (isGroup(ctx.sec)) { row.kind = 'manual'; t.classList.remove('linked'); }
  } else if (isLbl(t)) {
    row.label = t.value;
  } else return;
  refresh(); scheduleSave();
}

// Quick add on a collapsed card: append one row from the amount and note fields.
function onQuickAdd(e) {
  const f = e.target.closest('[data-quick]'); if (!f) return;
  e.preventDefault();
  const sec = f.dataset.quick; const amt = f.querySelector('.qa-amt'); const lbl = f.querySelector('.qa-lbl');
  const p = parseAmount(amt.value);
  if (!amt.value.trim() || !p.ok) { markBad(amt, true); amt.focus(); return; }
  const rows = rowsOf(curMonth(), sec);
  // Drop the placeholder blank row an empty category starts with before appending.
  if (rows.length === 1 && rows[0].amount == null && !rows[0].label) rows.length = 0;
  rows.push({ ...newRow(sec), amount: p.v, label: lbl.value.trim() });
  scheduleSave(); replaceCard(sec);
  $(`[data-sec="${sec}"] .qa-amt`)?.focus();
}

const ACTIONS = {
  import: () => openImport(),
  new: () => openNew(),
  'sec-add': () => openListDialog(),
  'sec-rename': (t) => openListDialog(t.dataset.key),
  'sec-del': (t) => deleteList(t.dataset.key),
};

function onClick(e) {
  const t = e.target.closest('button, tr[data-goto]');
  if (!t) return;
  if (ACTIONS[t.dataset.act]) return ACTIONS[t.dataset.act](t);
  if (t.dataset.goto !== undefined) return setTab(Number(t.dataset.goto));
  if (t.dataset.add) {
    const sec = t.dataset.add; const rows = rowsOf(curMonth(), sec);
    rows.push(newRow(sec)); scheduleSave(); renderMonth(); focusRow(sec, rows.length - 1); return;
  }
  if (t.classList.contains('del')) {
    const ctx = rowCtx(t); ctx.rows.splice(ctx.i, 1); scheduleSave(); renderMonth();
    focusRow(ctx.sec, Math.min(ctx.i, ctx.rows.length - 1));
  }
}

// Enter moves to the same field of the next row (Shift+Enter: previous), adding a row at the end.
function onKeydown(e) {
  const t = e.target;
  if (popKeydown(e, t)) return;
  if (e.key !== 'Enter' || !(isAmt(t) || isLbl(t))) return;
  e.preventDefault();
  const ctx = rowCtx(t);
  const next = ctx.i + (e.shiftKey ? -1 : 1);
  if (next < 0) return;
  if (next >= ctx.rows.length) { ctx.rows.push(newRow(ctx.sec)); scheduleSave(); renderMonth(); }
  focusRow(ctx.sec, next, isAmt(t) ? 'amt' : 'lbl');
}

// Show raw numbers (or the linked list's name) while editing and formatted numbers (1,234.50) otherwise.
function onFocusIn(e) {
  const t = e.target; if (!isAmt(t)) return;
  const ctx = rowCtx(t);
  t.value = (ctx && linkedList(ctx.sec, ctx.row)?.title) ?? amtText(ctx?.row.amount ?? null); t.select();
  if (isGroup(ctx?.sec)) showPop(t);
}
function onFocusOut(e) {
  const t = e.target;
  if (!isAmt(t) || !t.isConnected || onSummary()) return;
  markBad(t, false); hidePop();
  const { sec, row } = rowCtx(t);
  if (!row) return; // its row was just deleted (Safari keeps focus in the input when ✕ is clicked)
  t.value = linkedList(sec, row) ? linkedValue(row) : amtShow(row.amount);
}

// Paste a column (or two columns: amount, note) from a spreadsheet into an amount cell.
function onPaste(e) {
  const t = e.target;
  if (!isAmt(t)) return;
  const text = e.clipboardData.getData('text');
  if (!/[\n\t]/.test(text.trim())) return;
  e.preventDefault();
  const ctx = rowCtx(t);
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
  lines.forEach((line, k) => {
    const [a, ...rest] = line.split('\t');
    const p = parseAmount(a);
    const idx = ctx.i + k;
    if (!ctx.rows[idx]) ctx.rows.splice(idx, 0, newRow(ctx.sec));
    if (p.ok) ctx.rows[idx].amount = p.v;
    const lbl = rest.join(' ').trim();
    if (lbl) ctx.rows[idx].label = lbl;
  });
  scheduleSave(); renderMonth(); focusRow(ctx.sec, ctx.i + lines.length - 1);
}

export function initMonthEvents() {
  const view = $('#view');
  view.addEventListener('input', onInput);
  view.addEventListener('submit', onQuickAdd);
  view.addEventListener('click', onClick);
  view.addEventListener('keydown', onKeydown);
  view.addEventListener('focusin', onFocusIn);
  view.addEventListener('focusout', onFocusOut);
  view.addEventListener('paste', onPaste);
  onActivate(view, '[data-toggle-card]', (el) => toggleCard(el.dataset.toggleCard), 'button');
  onActivate(view, '[data-drill="donut"]', toggleDonut);
  onActivate(view, '[data-toggle="taxes"]', () => { state.hideTaxes = !state.hideTaxes; refresh(); });
  onActivate(view, '[data-act="open-income"]', () => openSettings('income', state.tab));
}
