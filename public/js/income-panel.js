// The Income dialog: one section per month with its paychecks (one, or two when paid bimonthly) and extra income.
// Edits are kept in a draft and applied to the year when the dialog is saved.
import { hasPayEntries, round2 } from '/lib/calc.js';
import { $, $$, esc, storedSet, onActivate, cancelled } from './dom.js';
import { inputNum, toMoney } from './format.js';
import { monthLabel } from './prefs.js';
import { state } from './state.js';
import { scheduleSave } from './save.js';
import { render } from './render.js';

let draft = []; let payPeriod = 'monthly';
// Months folded shut in the panel (click a month's title to toggle). Remembered per browser.
const collapsed = storedSet('ledgy.incCollapsed', Number.isInteger);
// When opened from a month's net income card only that month is expanded. This lasts until the dialog is next
// opened and leaves the remembered set above alone.
let focused = null;
const isShut = (i) => (focused ? focused.has(i) : collapsed.has(i));
const payCount = (mode) => (mode === 'bimonthly' ? 2 : 1);
const panel = () => $('#incomePanel');

const field = (attrs, val, label, type = 'number') => `<label class="tf"><input type="${type}" ${type === 'number' ? 'step="any" min="0"' : 'maxlength="60" autocomplete="off"'} ${attrs} value="${esc(val ?? '')}" placeholder=" "><span>${label}</span></label>`;

function monthHtml(m, i) {
  const shut = isShut(i);
  const head = shut
    ? `<div role="button" tabindex="0" data-toggle-inc="${i}" aria-expanded="false" title="Expand" style="cursor:pointer;padding:12px 16px;font-size:.875rem;font-weight:500">${esc(monthLabel(i))}</div>`
    : `<legend role="button" tabindex="0" data-toggle-inc="${i}" aria-expanded="true" title="Collapse" style="cursor:pointer">${esc(monthLabel(i))}</legend>`;
  const pays = Array.from({ length: payCount(payPeriod) }, (_, p) => `<div class="grid3" style="grid-template-columns:repeat(2,1fr)">
      ${field(`data-m="${i}" data-p="${p}" data-k="gross"`, m.pay[p].gross, `Paycheck ${p + 1} Gross`)}
      ${field(`data-m="${i}" data-p="${p}" data-k="taxes"`, m.pay[p].taxes, `Paycheck ${p + 1} Taxes`)}
    </div>`).join('');
  const extras = m.extras.map((x, j) => `<div class="grid3" style="grid-template-columns:1fr 1fr auto;align-items:center">
      ${field(`data-m="${i}" data-x="${j}" data-k="label"`, x.label, 'Extra income', 'text')}
      ${field(`data-m="${i}" data-x="${j}" data-k="amount"`, x.amount, 'Amount')}
      <button type="button" class="btn ghost" data-rm-m="${i}" data-rm-x="${j}" aria-label="Remove extra income">Remove</button>
    </div>`).join('');
  return `<fieldset${shut ? ' style="padding:0"' : ''}>
    ${head}
    <div style="display:grid;gap:inherit" ${shut ? 'hidden' : ''}>
    ${pays}
    ${extras}
    <div><button type="button" class="btn" data-add-extra="${i}">+ Add extra income</button></div>
    </div>
  </fieldset>`;
}

const renderPanel = () => { panel().innerHTML = draft.map(monthHtml).join(''); };

const toDraft = (doc) => doc.months.map((m) => ({
  pay: [0, 1].map((p) => ({ gross: m.pay?.[p]?.gross ?? null, taxes: m.pay?.[p]?.taxes ?? null })),
  extras: (m.extras || []).map((x) => ({ ...x })),
}));

// Write the draft into the year. Net income becomes gross minus taxes plus extras of the paychecks in use;
// a month whose entries were all cleared goes back to no income.
export function applyIncome(doc, mode, entries = toDraft(doc)) {
  const cnt = payCount(mode);
  doc.months.forEach((m, i) => {
    const d = entries[i];
    const had = hasPayEntries(m.pay, m.extras);
    m.pay = d.pay.map((p) => ({ gross: toMoney(p.gross), taxes: toMoney(p.taxes) }));
    m.extras = d.extras.map((x) => ({ label: x.label.trim(), amount: toMoney(x.amount) })).filter((x) => x.label || x.amount !== null);
    const used = m.pay.slice(0, cnt);
    if (hasPayEntries(used, m.extras)) {
      m.income = round2(used.reduce((t, p) => t + (p.gross || 0) - (p.taxes || 0), 0) + m.extras.reduce((t, x) => t + (x.amount || 0), 0));
    } else if (had) m.income = null;
  });
}

// Open the dialog. With a month index (from a month's net income card) only that month's section is expanded.
export function openIncome(month = null) {
  const { doc } = state;
  payPeriod = doc.settings.payPeriod || 'monthly';
  draft = toDraft(doc);
  focused = month === null ? null : new Set(draft.map((_, j) => j).filter((j) => j !== month));
  $('#incomeYearLbl').textContent = doc.year;
  renderPanel();
  $('#incomeDlg').showModal();
  if (month !== null) $(`#incomePanel [data-toggle-inc="${month}"]`)?.scrollIntoView({ block: 'start' });
}

function onSubmit(e) {
  if (cancelled(e)) return;
  applyIncome(state.doc, payPeriod, draft);
  scheduleSave(); render();
}

function toggle(el) {
  const i = Number(el.dataset.toggleInc);
  if (focused) { if (!focused.delete(i)) focused.add(i); } else collapsed.toggle(i);
  renderPanel();
  $(`#incomePanel [data-toggle-inc="${i}"]`)?.focus();
}

export function initIncome() {
  $('#incomeBtn').addEventListener('click', () => openIncome());
  $('#incomeClose').addEventListener('click', () => $('#incomeDlg').close());
  $('#incomeForm').addEventListener('submit', onSubmit);
  const el = panel();
  el.addEventListener('input', (e) => {
    const t = e.target; const m = draft[t.dataset.m]; if (!m) return;
    const v = t.dataset.k === 'label' ? t.value : inputNum(t);
    if (t.dataset.x !== undefined) m.extras[t.dataset.x][t.dataset.k] = v; else m.pay[t.dataset.p][t.dataset.k] = v;
  });
  onActivate(el, '[data-toggle-inc]', toggle);
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-toggle-inc]')) return;
    const b = e.target.closest('button'); if (!b) return;
    const { addExtra, rmM, rmX } = b.dataset;
    if (addExtra !== undefined) draft[addExtra].extras.push({ label: '', amount: null });
    else if (rmM !== undefined) draft[rmM].extras.splice(Number(rmX), 1);
    else return;
    renderPanel();
    if (addExtra !== undefined) $$(`#incomePanel input[data-m="${addExtra}"][data-k="label"]`).pop()?.focus();
  });
}
