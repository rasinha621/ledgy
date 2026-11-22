// The month tab: KPIs, one card per category with its rows, and the charts beside them.
import { GROUPS, DEFAULT_SAVINGS, baseLists, calcDrawdown, calcMonth, needsRowValue, listRows, sumRows, n } from '/lib/calc.js';
import { $, $$, esc, storedSet } from './dom.js';
import { fmt, usd, pct, amtShow } from './format.js';
import { state, onSummary, curMonth } from './state.js';
import { SEC, isGroup, sumLists, secMeta, rowsOf, newRow, linkedList } from './lists.js';
import { buildMonthCharts, updateMonthCharts } from './month-charts.js';
import { renderTabs } from './render.js';

// Collapsed cards hide their rows and show a one-line quick-add instead. Remembered per browser, per month.
const collapsed = storedSet('ledgy.collapsed');
const colKey = (sec) => `${state.tab}:${sec}`;

// The card and row an input or button belongs to.
export function rowCtx(el) {
  const card = el.closest('[data-sec]');
  if (!card || onSummary()) return null;
  const sec = card.dataset.sec; const rows = rowsOf(curMonth(), sec); const i = Number(el.dataset.i);
  return { sec, rows, i, row: rows[i], card };
}

export function focusRow(sec, i, cls = 'amt') {
  const card = $(`[data-sec="${sec}"]`);
  const el = card?.querySelector(`.row[data-i="${i}"] .${cls}`) || card?.querySelector(`.row[data-i="${i}"] .lbl`);
  if (el) { el.focus(); el.select?.(); }
}

// What a linked amount shows: its list's total.
export const linkedValue = (row) => fmt(needsRowValue(row, curMonth()));

function rowHtml(sec, r, i) {
  const link = linkedList(sec, r);
  const { ph } = secMeta(sec);
  const val = link ? linkedValue(r) : esc(amtShow(r.amount));
  const sum = sec === 'savings' && i < DEFAULT_SAVINGS.length ? `Summary: ${DEFAULT_SAVINGS[i]}. ` : '';
  const hint = isGroup(sec) ? ` title="${sum}${link ? `Total of ${esc(link.title)}. To unlink, type a number.` : 'Type an amount or pick a list to show its total.'}"` : '';
  const blank = !link && (r.amount === null || r.amount === undefined) && !r.label;
  return `<li class="row${blank ? ' blank' : ''}" data-i="${i}">
    <label class="tf"><input class="amt ${n(r.amount) < 0 ? 'neg' : ''} ${link ? 'linked' : ''}" data-i="${i}" inputmode="decimal" autocomplete="off" value="${val}" placeholder=" " aria-label="Amount"${hint}><span>Amount</span></label>
    <input class="lbl" data-i="${i}" value="${esc(r.label)}" placeholder="${link ? `Σ ${esc(link.title)}` : ph}" aria-label="${ph}">
    <button class="icon-btn del" data-i="${i}" aria-label="Delete row" title="Delete row">✕</button>
  </li>`;
}

const ADD_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" fill="none"/></svg>';

function cardHtml(sec) {
  const rows = rowsOf(curMonth(), sec);
  if (!rows.length) rows.push(newRow(sec)); // an empty category always has one row ready for input
  const meta = secMeta(sec);
  const budgeted = isGroup(sec); // the other lists can be renamed or deleted
  const sub = budgeted
    ? `<div class="card-sub"><span><span data-k="${sec}Budget"></span></span><span data-k="${sec}Pct"></span></div>
       <div class="meter" data-meter="${sec}"><span style="background:var(${meta.color})"></span></div>`
    : `<div class="feeds" data-feeds="${sec}"></div>`;
  const foot = sec === 'savings' ? '<div class="feeds" style="padding:0 14px 10px"></div>' : '';
  const isCol = collapsed.has(colKey(sec));
  return `<section class="card${isCol ? ' collapsed' : ''}" data-sec="${sec}">
    <div class="card-h" data-toggle-card="${sec}" role="button" tabindex="0" aria-expanded="${!isCol}" title="${isCol ? 'Expand' : 'Collapse'}">
      <div class="card-t"><span class="swatch" style="background:var(${meta.color})"></span>${esc(meta.title)}
        ${budgeted ? '' : `<button class="icon-btn sec-btn" data-act="sec-rename" data-key="${sec}" aria-label="Edit list" title="Edit list">✎</button><button class="icon-btn sec-btn" data-act="sec-del" data-key="${sec}" aria-label="Delete list" title="Delete list">✕</button>`}
        <span class="total" data-k="${sec}Total"></span></div>
      ${sub}
    </div>
    ${isCol ? `<form class="quick" data-quick="${sec}" autocomplete="off">
      <input class="qa-amt" inputmode="decimal" placeholder="Amount" aria-label="Amount">
      <input class="qa-lbl" placeholder="${esc(meta.ph)}" aria-label="${esc(meta.ph)}">
      <button class="qa-add" type="submit" aria-label="Add transaction" title="Add transaction">${ADD_ICON}</button>
    </form>` : `<ul class="rows">${rows.map((r, i) => rowHtml(sec, r, i)).join('')}</ul>
    <button class="add" data-add="${sec}">+ Add row</button>
    ${foot}`}
  </section>`;
}

const kpi = (k, label) => `<div class="kpi"><div class="k">${label} </div><div class="v" data-k="${k}"></div></div>`;

export function renderMonth() {
  const m = curMonth();
  const secs = [...GROUPS, ...baseLists(m).map((l) => l.key), ...(m.sections || []).map((s) => s.key)];
  $('#view').innerHTML = `
    <div class="kpis"><div class="kpis-main">
      <div class="kpi" role="button" tabindex="0" data-act="open-income" style="cursor:pointer" title="Change your income"><div class="k">Net income </div><div class="v">${usd(m.income)}</div></div>
      ${kpi('allocated', 'Allocated')}
      ${kpi('allocatedPct', 'Percent allocated')}
      </div>
      ${kpi('remaining', 'Amount remaining')}
    </div>
    <div class="month-grid">
      <div class="cols">${secs.map(cardHtml).join('')}
        <button class="add-list" data-act="sec-add">+ Add new category</button></div>
      <aside class="side">
        <section class="card chart-card">
          <h3>Spending breakdown</h3>
          <div class="sub" id="donutSub"></div>
          <div class="chart-box"><canvas id="donut" aria-label="Spending breakdown chart" role="img"></canvas></div>
          <div class="legend" id="donutLegend"></div>
        </section>
        <section class="card chart-card">
          <h3>Needs by line</h3>
          <div class="sub">Largest lines first. Rows linked to a list show that list’s total.</div>
          <div class="chart-box" id="needsBox"><canvas id="needsBar" aria-label="Needs by line chart" role="img"></canvas></div>
        </section>
      </aside>
    </div>`;
  buildMonthCharts(toggleDonut);
  refresh();
}

export function toggleDonut() { state.donutDrill = !state.donutDrill; refresh(); }

// Update totals, meters, linked amounts and charts without rebuilding the cards (so typing keeps focus).
export function refresh() {
  if (onSummary() || !state.doc) return;
  const m = curMonth();
  const c = calcMonth(m, state.doc.settings);
  const set = (k, text, neg) => $$(`[data-k="${k}"]`).forEach((el) => { el.textContent = text; el.classList.toggle('neg', !!neg); });
  for (const s of GROUPS) {
    set(`${s}Budget`, `$${fmt(c[`${s}Budget`])}`);
    set(`${s}Total`, `$${fmt(c[`${s}Total`])} spent`);
    const p = c[`${s}Pct`];
    const over = s !== 'savings' && p !== null && p > 1; const met = s === 'savings' && p !== null && p >= 1;
    const label = $(`[data-k="${s}Pct"]`); const meter = $(`[data-meter="${s}"]`);
    if (label) label.textContent = p === null ? 'Add income to get budget' : `${pct(p)} of budget`;
    if (meter) meter.firstElementChild.style.width = `${Math.max(0, Math.min(1, p ?? 0)) * 100}%`;
    for (const el of [label, meter]) if (el) { el.classList.toggle('over', over); el.classList.toggle('met', met); }
  }
  for (const l of sumLists()) {
    set(`${l.key}Total`, `$${fmt(sumRows(listRows(m, l.key)))} spent`);
    const el = $(`[data-feeds="${l.key}"]`);
    const row = m[l.group].find((r) => r.kind === l.key);
    if (el) el.textContent = row ? `Linked to ${row.label?.trim() ? `${row.label.trim()} in ` : ''}${SEC[l.group].title}` : 'Not linked to a row.';
  }
  $$('.amt.linked').forEach((el) => {
    const sec = el.closest('[data-sec]')?.dataset.sec;
    if (el !== document.activeElement && isGroup(sec)) el.value = linkedValue(m[sec][Number(el.dataset.i)]);
  });
  set('allocated', usd(c.allocated));
  set('allocatedPct', pct(c.allocatedPct));
  const { covered } = calcDrawdown(state.doc)[state.tab];
  set('remaining', usd(c.remaining), c.remaining < -0.005 && !covered);
  $$('[data-k="remaining"]').forEach((el) => el.classList.toggle('warn', covered));
  updateMonthCharts(m, c);
  renderTabs();
}

// Swap just one card's markup so the charts beside it aren't rebuilt.
export function replaceCard(sec) {
  const el = $(`[data-sec="${sec}"]`); if (!el) return renderMonth();
  el.outerHTML = cardHtml(sec);
  refresh();
}

export function toggleCard(sec) {
  const shut = collapsed.toggle(colKey(sec));
  replaceCard(sec);
  $(`[data-sec="${sec}"] ${shut ? '.qa-amt' : '[data-toggle-card]'}`)?.focus();
}
