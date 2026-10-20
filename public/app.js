import { MONTHS, calcMonth, calcSummary, needsRowValue, listRows, sumRows, n } from '/lib/calc.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Round like Excel: use 15 significant digits first, then round half away from zero.
const round2 = (v) => Math.sign(v) * Math.round(Number((Math.abs(v) * 100).toPrecision(15))) / 100;
const fmt = (v) => (v === null || v === undefined ? '—' : (round2(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const usd = (v) => (v === null || v === undefined ? '—' : (v < 0 ? '-$' : '$') + fmt(Math.abs(v)));
const pct = (v) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(2)}%`);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage not available */ } },
};
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* ---------- Preferences (per browser) ---------- */
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_STYLES = { upper: 'JAN', title: 'Jan', num: '01', full: 'January' };
const COLOR_PREFS = [
  ['--accent', 'Accent'], ['--wants', 'Wants'], ['--needs', 'Needs'], ['--savings', 'Savings'], ['--bank', 'Bank savings'],
];
const loadPrefs = () => {
  let p = {};
  try { p = JSON.parse(store.get('ledgy.prefs') || '{}') || {}; } catch { /* ignore bad JSON */ }
  return { theme: ['light', 'dark'].includes(p.theme) ? p.theme : 'auto', monthStyle: MONTH_STYLES[p.monthStyle] ? p.monthStyle : 'upper', colors: p.colors && typeof p.colors === 'object' ? p.colors : {} };
};
let prefs = loadPrefs();
const monthLabel = (i) => {
  const st = prefs.monthStyle;
  return st === 'full' ? FULL_MONTHS[i] : st === 'num' ? String(i + 1).padStart(2, '0') : st === 'title' ? FULL_MONTHS[i].slice(0, 3) : MONTHS[i];
};
const monthLabels = () => MONTHS.map((_, i) => monthLabel(i));
// Pick black or white text for a background color.
const onColor = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#000000' : '#ffffff';
};
function applyPrefs() {
  const root = document.documentElement;
  if (prefs.theme === 'auto') root.removeAttribute('data-theme'); else root.dataset.theme = prefs.theme;
  // Clear earlier overrides first so the defaults below are read for the active theme.
  for (const v of ['--wants', '--needs', '--savings', '--bank', '--md-sys-color-primary', '--md-sys-color-on-primary']) root.style.removeProperty(v);
  for (const [v] of COLOR_PREFS) {
    const c = prefs.colors[v];
    if (!/^#[0-9a-f]{6}$/i.test(c || '')) continue;
    if (v === '--accent') {
      root.style.setProperty('--md-sys-color-primary', c); root.style.setProperty('--md-sys-color-on-primary', onColor(c));
    } else root.style.setProperty(v, c);
  }
}
applyPrefs();

const SEC = {
  wants: { title: 'Wants', color: '--wants', cols: 'A / B', ph: 'Note' },
  needs: { title: 'Needs', color: '--needs', cols: 'E / F', ph: 'Label' },
  savings: { title: 'Savings', color: '--savings', cols: 'I / J', ph: 'Label' },
  groceries: { title: 'Groceries', color: '--needs', cols: 'Q / R', ph: 'Note' },
  transit: { title: 'Transit', color: '--needs', cols: 'S / T', ph: 'Note' },
};
const BASE_SECS = ['wants', 'needs', 'savings', 'groceries', 'transit'];
// Lists whose total can feed a Needs row: Groceries, Transit and the ones added to this month.
const LINKABLE = ['wants', 'needs', 'savings']; // sections whose rows can total a list
const GROUP_LABEL = { needs: 'Need', wants: 'Want', savings: 'Saving' };
// All lists of the current month. Groceries and Transit are Needs lists; the rest carry their own group.
const sumLists = (group, m = doc.months[tab]) => [
  { key: 'groceries', title: 'Groceries', group: 'needs' }, { key: 'transit', title: 'Transit', group: 'needs' },
  ...(m?.sections || []).map((s) => ({ ...s, group: s.group || 'needs' })),
].filter((l) => !group || l.group === group);
const listInfo = (key) => sumLists().find((l) => l.key === key);
const findList = (text, group) => {
  const q = String(text).trim().replace(/^Σ\s*/, '').toLowerCase();
  return q ? sumLists(group).find((l) => l.title.toLowerCase() === q) : undefined;
};
const secMeta = (sec) => SEC[sec] || { title: listInfo(sec)?.title ?? sec, color: `--${listInfo(sec)?.group ?? 'needs'}`, ph: 'Note' };
const rowsOf = (month, sec) => (BASE_SECS.includes(sec) ? month[sec] : ((month.custom ||= {})[sec] ||= []));
const SUMMARY_SAVINGS = ['401k', 'HSA', 'Roth', 'Bank/Fidelity Savings'];

let years = [];
let doc = null;
let tab = 0; // 0..11 or 'summary'
const charts = {};

/* ---------- API and saving ---------- */
async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) { const e = new Error(body?.error || res.statusText); e.status = res.status; throw e; }
  return body;
}

let saveTimer = null; let saving = null; let dirty = false;
function setSaveState(text, err = false) { const el = $('#saveState'); el.textContent = text; el.classList.toggle('err', err); }
function scheduleSave() {
  dirty = true; setSaveState('Not saved');
  clearTimeout(saveTimer); saveTimer = setTimeout(flush, 600);
}
async function flush() {
  clearTimeout(saveTimer);
  if (saving) { await saving; if (!dirty) return; }
  if (!dirty || !doc) return;
  dirty = false; setSaveState('Saving…');
  const body = JSON.stringify(doc);
  saving = api(`/api/years/${doc.year}`, { method: 'PUT', body })
    .then((saved) => { doc.updatedAt = saved.updatedAt; if (!dirty) setSaveState('Saved'); })
    .catch((e) => {
      setSaveState('Not saved', true);
      if (e.status === 409) showBanner(`${e.message} <button class="btn" id="reloadBtn">Reload</button>`);
      else { dirty = true; saveTimer = setTimeout(flush, 4000); }
    })
    .finally(() => { saving = null; });
  await saving;
}
window.addEventListener('beforeunload', (e) => { if (dirty) { flush(); e.preventDefault(); } });

function showBanner(html) { const b = $('#banner'); b.innerHTML = html; b.hidden = !html; }
document.addEventListener('click', (e) => { if (e.target.id === 'reloadBtn') location.reload(); });

/* ---------- Amount input: numbers, $ and commas, or =1+2 ---------- */
function parseAmount(raw) {
  let s = String(raw).trim().replace(/[$,\s]/g, '');
  if (!s) return { ok: true, v: null };
  if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return { ok: true, v: Number(s) };
  if (s.startsWith('=')) s = s.slice(1);
  if (!/^[-+*/().\d]+$/.test(s)) return { ok: false };
  try {
    const v = Function(`"use strict";return (${s})`)();
    return Number.isFinite(v) ? { ok: true, v: Math.round(v * 1e10) / 1e10 } : { ok: false };
  } catch { return { ok: false }; }
}
const amtText = (v) => (v === null || v === undefined ? '' : String(v));
const amtShow = (v) => (v === null || v === undefined ? '' : fmt(v));

/* ---------- Load ---------- */
async function loadYears(select) {
  years = await api('/api/years');
  const sel = $('#yearSelect');
  sel.innerHTML = years.map((y) => `<option value="${y.year}">${y.year}</option>`).join('');
  sel.hidden = !years.length;
  const want = select ?? Number(store.get('ledgy.year'));
  const pick = years.find((y) => y.year === want) || years[years.length - 1];
  if (pick) { sel.value = pick.year; await loadYear(pick.year); } else { doc = null; render(); }
}
async function loadYear(y) {
  await flush();
  doc = await api(`/api/years/${y}`);
  store.set('ledgy.year', String(y));
  const now = new Date();
  const saved = store.get('ledgy.tab');
  tab = saved === 'summary' ? 'summary' : (doc.year === now.getFullYear() ? now.getMonth() : Number(saved) || 0);
  if (!(tab === 'summary' || (tab >= 0 && tab < 12))) tab = 0;
  setSaveState('Saved'); showBanner('');
  render();
}

/* ---------- Render ---------- */
function render() {
  Object.values(charts).forEach((c) => c.destroy());
  for (const k of Object.keys(charts)) delete charts[k];
  const has = !!doc;
  for (const id of ['#exportBtn', '#settingsBtn']) $(id).hidden = !has;
  if (!has) { $('#tabs').innerHTML = ''; $('#view').innerHTML = emptyState(); return; }
  $('#exportBtn').href = `/api/years/${doc.year}/export.xlsx`;
  renderTabs();
  if (tab === 'summary') renderSummary(); else renderMonth();
}

function emptyState() {
  return `<div class="empty">
    <h1>No budget yet</h1>
    <p class="muted">Import your spreadsheet to bring in all months, or start a blank year. Each month uses the same layout: Wants, Needs and Savings with budgets from your income.</p>
    <div class="btns"><button class="btn primary" data-act="import">Import .xlsx</button><button class="btn tonal" data-act="new">Start a new year</button></div>
  </div>`;
}

function renderTabs() {
  const sums = doc.months.map((m) => calcMonth(m, doc.settings));
  $('#tabs').innerHTML = MONTHS.map((_, i) => {
    const over = sums[i].hasIncome && sums[i].remaining < -0.005;
    return `<button class="tab" role="tab" data-tab="${i}" aria-selected="${tab === i}" title="${over ? 'Over income' : ''}">${monthLabel(i)}${over ? '<span class="dot" aria-label="over income"></span>' : ''}</button>`;
  }).join('') + `<button class="tab sum" role="tab" data-tab="summary" aria-selected="${tab === 'summary'}">Summary</button>`;
}

function rowHtml(sec, r, i, month) {
  const link = LINKABLE.includes(sec) && r.kind && r.kind !== 'manual' ? listInfo(r.kind) : null;
  const val = link ? fmt(needsRowValue(r, month)) : esc(amtShow(r.amount));
  const sum = sec === 'savings' && i < 4 ? `Summary: ${SUMMARY_SAVINGS[i]}. ` : '';
  const hint = LINKABLE.includes(sec) ? ` title="${sum}${link ? `Total of ${esc(link.title)}. Type a number to unlink.` : 'Type an amount, or pick a list to total'}"` : '';
  return `<li class="row" data-i="${i}">
    <input class="amt ${n(r.amount) < 0 ? 'neg' : ''} ${link ? 'linked' : ''}" data-i="${i}" inputmode="decimal" autocomplete="off" value="${val}" aria-label="Amount"${hint}>
    <input class="lbl" data-i="${i}" value="${esc(r.label)}" placeholder="${link ? `Σ ${esc(link.title)}` : secMeta(sec).ph}" aria-label="${secMeta(sec).ph}">
    <button class="icon-btn del" data-i="${i}" aria-label="Delete row" title="Delete row">✕</button>
  </li>`;
}

function cardHtml(sec, month) {
  const rows = rowsOf(month, sec);
  const meta = secMeta(sec);
  const custom = !BASE_SECS.includes(sec);
  const budgeted = ['wants', 'needs', 'savings'].includes(sec);
  const sub = budgeted
    ? `<div class="card-sub"><span>Budget <span data-k="${sec}Budget"></span></span><span data-k="${sec}Pct"></span></div>
       <div class="meter" data-meter="${sec}"><span style="background:var(${meta.color})"></span></div>`
    : `<div class="feeds" data-feeds="${sec}"></div>`;
  const foot = sec === 'savings' ? '<div class="feeds" style="padding:0 14px 10px">Rows 1–4 feed the Summary: 401k, HSA, Roth, Bank savings.</div>' : '';
  return `<section class="card" data-sec="${sec}">
    <div class="card-h">
      <div class="card-t"><span class="swatch" style="background:var(${meta.color})"></span>${esc(meta.title)}
        ${custom ? `<button class="icon-btn sec-btn" data-act="sec-rename" data-key="${sec}" aria-label="Edit list" title="Edit list">✎</button><button class="icon-btn sec-btn" data-act="sec-del" data-key="${sec}" aria-label="Delete list" title="Delete list">✕</button>` : ''}
        <span class="total" data-k="${sec}Total"></span></div>
      ${sub}
    </div>
    <ul class="rows">${rows.length ? rows.map((r, i) => rowHtml(sec, r, i, month)).join('') : '<li class="empty-row">No rows yet.</li>'}</ul>
    <button class="add" data-add="${sec}">+ Add row</button>
    ${foot}
  </section>`;
}

function renderMonth() {
  const m = doc.months[tab];
  $('#view').innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="k">Income </div><input class="v" id="income" inputmode="decimal" value="${esc(amtShow(m.income))}" placeholder="0.00" aria-label="Income"></div>
      <div class="kpi"><div class="k">Allocated </div><div class="v" data-k="allocated"></div></div>
      <div class="kpi"><div class="k">Percentage spent </div><div class="v" data-k="allocatedPct"></div></div>
      <div class="kpi"><div class="k">Amount remaining </div><div class="v" data-k="remaining"></div></div>
    </div>
    <div class="month-grid">
      <div class="cols">${[...BASE_SECS, ...(m.sections || []).map((s) => s.key)].map((s) => cardHtml(s, m)).join('')}
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
  buildMonthCharts();
  refresh();
}

function refresh() {
  if (tab === 'summary' || !doc) return;
  const m = doc.months[tab];
  const c = calcMonth(m, doc.settings);
  const set = (k, text, neg) => document.querySelectorAll(`[data-k="${k}"]`).forEach((el) => {
    el.textContent = text; el.classList.toggle('neg', !!neg);
  });
  for (const s of ['wants', 'needs', 'savings']) {
    set(`${s}Budget`, fmt(c[`${s}Budget`]));
    set(`${s}Total`, fmt(c[`${s}Total`]));
    const p = c[`${s}Pct`];
    const el = $(`[data-k="${s}Pct"]`);
    if (el) { el.textContent = p === null ? 'Add income to get goal' : `${pct(p)} of budget`; el.classList.toggle('over', s !== 'savings' && p !== null && p > 1); el.classList.toggle('met', s === 'savings' && p !== null && p >= 1); }
    const meter = $(`[data-meter="${s}"]`);
    if (meter) { meter.classList.toggle('over', s !== 'savings' && p !== null && p > 1); meter.classList.toggle('met', s === 'savings' && p !== null && p >= 1); meter.firstElementChild.style.width = `${Math.max(0, Math.min(1, p ?? 0)) * 100}%`; }
  }
  for (const l of sumLists()) {
    set(`${l.key}Total`, fmt(sumRows(listRows(m, l.key))));
    const el = $(`[data-feeds="${l.key}"]`);
    const row = m[l.group].find((r) => r.kind === l.key);
    if (el) el.textContent = row ? `Total feeds the ${SEC[l.group].title} row “${row.label || l.title}”.` : `Not linked to ${SEC[l.group].title}. Type this list’s name in a ${SEC[l.group].title} amount to link it.`;
  }
  document.querySelectorAll('.amt.linked').forEach((el) => {
    const sec = el.closest('[data-sec]')?.dataset.sec;
    if (el !== document.activeElement && LINKABLE.includes(sec)) el.value = fmt(needsRowValue(m[sec][Number(el.dataset.i)], m));
  });
  set('allocated', fmt(c.allocated));
  set('allocatedPct', c.allocatedPct === null ? '#DIV/0!' : pct(c.allocatedPct));
  set('remaining', fmt(c.remaining), c.remaining < -0.005);
  updateMonthCharts(m, c);
  renderTabs();
}

/* ---------- Charts ---------- */
function chartTheme() {
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 12;
  Chart.defaults.color = cssVar('--text-2');
  Chart.defaults.borderColor = cssVar('--line');
}
const tooltip = (label) => ({
  backgroundColor: cssVar('--tooltip-bg'), titleColor: cssVar('--tooltip-fg'), bodyColor: cssVar('--tooltip-fg'),
  cornerRadius: 4, padding: 8, boxPadding: 4, usePointStyle: true,
  callbacks: { label },
});

const centerText = {
  id: 'centerText',
  afterDraw(chart, _a, opts) {
    if (!opts?.lines) return;
    const { ctx, chartArea: { left, right, top, bottom } } = chart;
    const x = (left + right) / 2; const y = (top + bottom) / 2;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = cssVar('--muted'); ctx.font = `12px ${Chart.defaults.font.family}`;
    ctx.fillText(opts.lines[0], x, y - 11);
    ctx.fillStyle = cssVar('--text'); ctx.font = `600 17px ${Chart.defaults.font.family}`;
    ctx.fillText(opts.lines[1], x, y + 9);
    ctx.restore();
  },
};

function donutData(c) {
  const parts = [
    { label: 'Wants', value: c.wantsTotal, color: cssVar('--wants') },
    { label: 'Needs', value: c.needsTotal, color: cssVar('--needs') },
    { label: 'Savings', value: c.savingsTotal, color: cssVar('--savings') },
  ];
  if (c.hasIncome && c.remaining > 0.005) parts.push({ label: 'Unallocated', value: c.remaining, color: cssVar('--free') });
  return parts;
}

function buildMonthCharts() {
  chartTheme();
  charts.donut = new Chart($('#donut'), {
    type: 'doughnut',
    data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderColor: cssVar('--surface'), borderWidth: 2, hoverOffset: 4 }] },
    options: {
      cutout: '68%', maintainAspectRatio: false, animation: { duration: 250 },
      plugins: {
        legend: { display: false },
        tooltip: tooltip((ctx) => ` ${ctx.label}: ${usd(ctx.raw)}`),
        centerText: { lines: null },
      },
    },
    plugins: [centerText],
  });
  charts.needs = new Chart($('#needsBar'), {
    type: 'bar',
    data: { labels: [], datasets: [{ data: [], backgroundColor: cssVar('--needs'), borderRadius: 4, borderSkipped: 'start', barPercentage: 0.8, categoryPercentage: 0.9 }] },
    options: {
      indexAxis: 'y', maintainAspectRatio: false, animation: { duration: 250 },
      plugins: { legend: { display: false }, tooltip: tooltip((ctx) => ` ${usd(ctx.raw)}`) },
      scales: {
        x: { grid: { color: cssVar('--line') }, border: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12, callback: (v) => (Math.abs(v) >= 1000 ? `$${+(v / 1000).toFixed(1)}k` : `$${v}`) } },
        y: { grid: { display: false }, border: { display: false } },
      },
    },
  });
}

function updateMonthCharts(m, c) {
  if (!charts.donut) return;
  const parts = donutData(c);
  const shown = parts.map((p) => Math.max(0, p.value));
  const ds = charts.donut.data.datasets[0];
  charts.donut.data.labels = parts.map((p) => p.label);
  ds.data = shown; ds.backgroundColor = parts.map((p) => p.color);
  const base = c.hasIncome && c.income > 0 ? c.income : shown.reduce((a, b) => a + b, 0);
  charts.donut.options.plugins.centerText.lines = ['Allocated', usd(c.allocated)];
  charts.donut.update();
  $('#donutSub').textContent = c.hasIncome
    ? (c.remaining < -0.005 ? `Over income by ${usd(-c.remaining)}.` : `Share of income ${usd(c.income)}.`)
    : 'No income entered. Shares are of the total allocated.';
  $('#donutLegend').innerHTML = parts.map((p) => `<div><span class="swatch" style="background:${p.color}"></span><span>${p.label}</span>
    <span>${usd(p.value)}</span><span class="pct">${base ? pct(p.value / base) : '—'}</span></div>`).join('');

  const lines = m.needs.map((r, i) => ({ label: r.label || `Row ${i + 2}`, value: needsRowValue(r, m) }))
    .filter((l) => l.value > 0).sort((a, b) => b.value - a.value);
  const top = lines.slice(0, 9);
  const rest = lines.slice(9).reduce((t, l) => t + l.value, 0);
  if (rest > 0) top.push({ label: 'Other lines', value: rest });
  charts.needs.data.labels = top.map((l) => l.label);
  charts.needs.data.datasets[0].data = top.map((l) => l.value);
  $('#needsBox').style.height = `${Math.max(120, top.length * 28 + 40)}px`;
  charts.needs.update();
}

/* ---------- Summary ---------- */
function renderSummary() {
  const s = calcSummary(doc);
  const cols = [
    ['Total income', s.totalIncome], ['Total Wants', s.totalWants], ['Total Needs', s.totalNeeds],
    ['Total Savings', s.totalSavings], ['Bank/Fidelity Savings', s.bankSavings],
    ['Roth', s.roth, doc.settings.limitRoth], ['HSA', s.hsa, doc.settings.limitHsa], ['401k', s.k401, doc.settings.limit401k],
  ];
  const rows = s.months.map((c, i) => `<tr data-goto="${i}" style="cursor:pointer">
      <td>${monthLabel(i)}</td><td>${c.hasIncome ? fmt(c.income) : '—'}</td>
      <td>${fmt(c.wantsTotal)}</td><td class="${c.wantsPct > 1 ? 'over' : ''}">${pct(c.wantsPct)}</td>
      <td>${fmt(c.needsTotal)}</td><td class="${c.needsPct > 1 ? 'over' : ''}">${pct(c.needsPct)}</td>
      <td>${fmt(c.savingsTotal)}</td><td>${pct(c.savingsPct)}</td>
      <td>${fmt(c.allocated)}</td><td class="${c.remaining < -0.005 ? 'over' : ''}">${fmt(c.remaining)}</td></tr>`).join('');
  $('#view').innerHTML = `
    <section class="card"><div class="table-wrap"><table class="sum-table">
      <thead><tr>${cols.map(([h]) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody><tr>${cols.map(([, v, limit]) => {
        if (!(limit > 0)) return `<td>${usd(v)}</td>`;
        if (v > limit + 0.005) return `<td class="over" title="Over the ${esc(usd(limit))} limit">${usd(v)}</td>`;
        if (v >= limit - 0.005) return `<td class="met" title="Annual limit met">${usd(v)}</td>`;
        return `<td title="Limit ${esc(usd(limit))}">${usd(v)}</td>`;
      }).join('')}</tr></tbody>
    </table></div></section>
    <div class="summary-grid">
      <section class="card chart-card">
        <h3>Year breakdown</h3>
        <div class="chart-box tall"><canvas id="pie" role="img" aria-label="Year breakdown chart"></canvas></div>
        <div class="legend" id="pieLegend"></div>
      </section>
      <section class="card chart-card">
        <h3>Spending by month</h3>
        <div class="sub">Wants, Needs and Savings stacked. The line is income.</div>
        <div class="chart-box tall"><canvas id="monthly" role="img" aria-label="Spending by month chart"></canvas></div>
      </section>
    </div>
    <section class="card" style="margin-top:16px"><div class="table-wrap"><table>
      <thead><tr><th>Month</th><th>Income</th><th>Wants</th><th>% of budget</th><th>Needs</th><th>% of budget</th><th>Savings</th><th>% of budget</th><th>Allocated</th><th>Remaining</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>Total</td><td>${fmt(s.totalIncome)}</td><td>${fmt(s.totalWants)}</td><td></td><td>${fmt(s.totalNeeds)}</td><td></td>
        <td>${fmt(s.months.reduce((t, c) => t + c.savingsTotal, 0))}</td><td></td>
        <td>${fmt(s.months.reduce((t, c) => t + c.allocated, 0))}</td><td>${fmt(s.months.reduce((t, c) => t + c.remaining, 0))}</td></tr></tfoot>
    </table></div></section>`;

  chartTheme();
  const pieParts = [
    ['Total Wants', s.totalWants, cssVar('--wants')], ['Total Needs', s.totalNeeds, cssVar('--needs')],
    ['Retirement/HSA', s.retirementHsa, cssVar('--savings')], ['Bank/Fidelity Savings', s.bankSavings, cssVar('--bank')],
  ];
  const pieTotal = pieParts.reduce((t, p) => t + Math.max(0, p[1]), 0);
  charts.pie = new Chart($('#pie'), {
    type: 'pie',
    data: { labels: pieParts.map((p) => p[0]), datasets: [{ data: pieParts.map((p) => Math.max(0, p[1])), backgroundColor: pieParts.map((p) => p[2]), borderColor: cssVar('--surface'), borderWidth: 2 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tooltip((ctx) => ` ${ctx.label}: ${usd(ctx.raw)} (${pieTotal ? pct(ctx.raw / pieTotal) : '—'})`) } },
  });
  $('#pieLegend').innerHTML = pieParts.map(([l, v, col]) => `<div><span class="swatch" style="background:${col}"></span><span>${l}</span><span>${usd(v)}</span><span class="pct">${pieTotal ? pct(Math.max(0, v) / pieTotal) : '—'}</span></div>`).join('');

  const bar = (label, key, color) => ({ type: 'bar', label, data: s.months.map((c) => Math.max(0, c[key])), backgroundColor: color, stack: 's', borderColor: cssVar('--surface'), borderWidth: { top: 2 }, borderRadius: 3, borderSkipped: 'start' });
  charts.monthly = new Chart($('#monthly'), {
    data: {
      labels: monthLabels(),
      datasets: [
        { type: 'line', label: 'Income', data: s.months.map((c) => (c.hasIncome ? c.income : null)), borderColor: cssVar('--text-2'), borderWidth: 2, borderDash: [5, 4], pointRadius: 4, pointBackgroundColor: cssVar('--surface'), pointBorderWidth: 2, spanGaps: false, order: 0 },
        bar('Wants', 'wantsTotal', cssVar('--wants')), bar('Needs', 'needsTotal', cssVar('--needs')), bar('Savings', 'savingsTotal', cssVar('--savings')),
      ],
    },
    options: {
      maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'start', labels: { usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 10, boxHeight: 10 } },
        tooltip: tooltip((ctx) => ` ${ctx.dataset.label}: ${usd(ctx.raw)}`),
      },
      scales: {
        x: { stacked: true, grid: { display: false }, border: { display: false } },
        y: { stacked: true, beginAtZero: true, grid: { color: cssVar('--line') }, border: { display: false }, ticks: { callback: (v) => `$${Number(v).toLocaleString('en-US')}` } },
      },
    },
  });
}

/* ---------- Events ---------- */
const view = $('#view');
function rowCtx(el) {
  const card = el.closest('[data-sec]');
  if (!card || tab === 'summary') return null;
  const sec = card.dataset.sec;
  return { sec, rows: rowsOf(doc.months[tab], sec), i: Number(el.dataset.i), card };
}
function newRow(sec) { return LINKABLE.includes(sec) ? { amount: null, label: '', kind: 'manual' } : { amount: null, label: '' }; }
function focusRow(sec, i, cls = 'amt') {
  const card = $(`[data-sec="${sec}"]`);
  const el = card?.querySelector(`.row[data-i="${i}"] .${cls}`) || card?.querySelector(`.row[data-i="${i}"] .lbl`);
  if (el) { el.focus(); el.select?.(); }
}

view.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'income') {
    const p = parseAmount(t.value);
    if (!p.ok) return;
    doc.months[tab].income = p.v; refresh(); scheduleSave(); return;
  }
  const ctx = rowCtx(t); if (!ctx) return;
  const row = ctx.rows[ctx.i];
  if (t.classList.contains('amt')) {
    if (LINKABLE.includes(ctx.sec)) {
      showPop(t);
      const hit = findList(t.value, ctx.sec);
      if (hit) { row.kind = hit.key; row.amount = null; t.classList.add('linked'); t.style.color = ''; refresh(); scheduleSave(); return; }
    }
    const p = parseAmount(t.value);
    t.style.color = p.ok ? '' : 'var(--over)';
    if (!p.ok) return;
    row.amount = p.v; t.classList.toggle('neg', n(p.v) < 0);
    if (LINKABLE.includes(ctx.sec)) { row.kind = 'manual'; t.classList.remove('linked'); }
  } else if (t.classList.contains('lbl')) {
    row.label = t.value;
  } else return;
  refresh(); scheduleSave();
});

/* Picker that links a Needs amount to a list total (or just type a number). */
const pop = document.createElement('div');
pop.id = 'sumPop'; pop.hidden = true; document.body.append(pop);
let popFor = null; let popHi = -1;
function popItems(t) {
  const sec = rowCtx(t).sec; const q = t.value.trim().replace(/^Σ\s*/, '').toLowerCase();
  return !q || /^[-+=$.\d]/.test(q) || findList(q, sec) ? sumLists(sec) : sumLists(sec).filter((l) => l.title.toLowerCase().includes(q));
}
function showPop(t) {
  const items = popItems(t);
  popFor = t; popHi = -1;
  if (!items.length) { pop.hidden = true; return; }
  const m = doc.months[tab]; const cur = rowCtx(t).rows[rowCtx(t).i].kind;
  pop.innerHTML = '<div class="pop-h">Total of a list</div>' + items.map((l) => `<button type="button" data-key="${l.key}" class="${l.key === cur ? 'cur' : ''}"><span>Σ ${esc(l.title)}</span><span>${fmt(sumRows(listRows(m, l.key)))}</span></button>`).join('');
  const r = t.getBoundingClientRect();
  pop.style.left = `${r.left}px`; pop.style.top = `${r.bottom + 2}px`; pop.style.minWidth = `${Math.max(r.width, 200)}px`;
  pop.hidden = false;
}
function hidePop() { pop.hidden = true; popFor = null; popHi = -1; }
function pickList(key) {
  const t = popFor; if (!t) return;
  const ctx = rowCtx(t); const row = ctx.rows[ctx.i];
  row.kind = key; row.amount = null;
  t.classList.add('linked'); t.style.color = ''; t.value = listInfo(key).title; t.select();
  hidePop(); scheduleSave(); refresh();
}
pop.addEventListener('mousedown', (e) => { // keep focus in the input
  e.preventDefault();
  const b = e.target.closest('button[data-key]'); if (b) pickList(b.dataset.key);
});
window.addEventListener('scroll', hidePop, true);

view.addEventListener('click', async (e) => {
  const t = e.target.closest('button, tr[data-goto]');
  if (!t) return;
  if (t.dataset.act === 'import') return openImport();
  if (t.dataset.act === 'new') return openNew();
  if (t.dataset.act === 'sec-add' || t.dataset.act === 'sec-rename') {
    const sec = t.dataset.act === 'sec-rename' ? doc.months[tab].sections.find((s) => s.key === t.dataset.key) : null;
    listEditing = sec;
    $('#listDlgTitle').textContent = sec ? `Edit list (${monthLabel(tab)})` : `New summation list (${monthLabel(tab)})`;
    const f = $('#listForm'); f.elements.title.value = sec?.title ?? ''; f.elements.group.value = sec?.group ?? 'needs';
    $('#listDlg').showModal(); f.elements.title.focus(); return;
  }
  if (t.dataset.act === 'sec-del') {
    const sec = doc.months[tab].sections.find((s) => s.key === t.dataset.key);
    const m = doc.months[tab];
    if (!await askDialog({ title: `Delete “${sec.title}”?`, text: `The list and its rows will be removed from this month's spending. Rows linked to it become empty amounts.`, ok: 'Delete', danger: true })) return;
    m.sections = m.sections.filter((s) => s !== sec);
    delete m.custom?.[sec.key];
    for (const g of LINKABLE) for (const r of m[g]) if (r.kind === sec.key) { r.kind = 'manual'; r.amount = null; }
    scheduleSave(); return renderMonth();
  }
  if (t.dataset.goto !== undefined) { tab = Number(t.dataset.goto); store.set('ledgy.tab', String(tab)); return render(); }
  if (t.dataset.add) {
    const sec = t.dataset.add; const rows = rowsOf(doc.months[tab], sec);
    rows.push(newRow(sec)); scheduleSave(); renderMonth(); focusRow(sec, rows.length - 1); return;
  }
  if (t.classList.contains('del')) {
    const ctx = rowCtx(t); ctx.rows.splice(ctx.i, 1); scheduleSave(); renderMonth();
    focusRow(ctx.sec, Math.min(ctx.i, ctx.rows.length - 1));
  }
});

view.addEventListener('keydown', (e) => {
  const t = e.target;
  if (!pop.hidden && popFor === t) {
    const btns = [...pop.querySelectorAll('button')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); popHi = (popHi + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length;
      btns.forEach((b, k) => b.classList.toggle('hi', k === popHi)); return;
    }
    if (e.key === 'Enter' && popHi >= 0) { e.preventDefault(); pickList(btns[popHi].dataset.key); return; }
    if (e.key === 'Escape') { hidePop(); return; }
  }
  if (e.key !== 'Enter' || !(t.classList.contains('amt') || t.classList.contains('lbl'))) return;
  e.preventDefault();
  const ctx = rowCtx(t);
  const cls = t.classList.contains('amt') ? 'amt' : 'lbl';
  const next = ctx.i + (e.shiftKey ? -1 : 1);
  if (next < 0) return;
  if (next >= ctx.rows.length) { ctx.rows.push(newRow(ctx.sec)); scheduleSave(); renderMonth(); }
  focusRow(ctx.sec, next, cls);
});

// Show raw numbers while editing and formatted numbers (1,234.50) otherwise.
const modelValue = (t) => { const ctx = rowCtx(t); return ctx ? ctx.rows[ctx.i].amount : doc.months[tab].income; };
const linkedList = (t) => { const ctx = rowCtx(t); const k = LINKABLE.includes(ctx?.sec) ? ctx.rows[ctx.i].kind : 'manual'; return k && k !== 'manual' ? listInfo(k) : null; };
view.addEventListener('focusin', (e) => {
  const t = e.target;
  if (t.classList.contains('amt') || t.id === 'income') {
    t.value = linkedList(t)?.title ?? amtText(modelValue(t)); t.select();
    if (LINKABLE.includes(rowCtx(t)?.sec)) showPop(t);
  }
});
view.addEventListener('focusout', (e) => {
  const t = e.target;
  if (!(t.classList.contains('amt') || t.id === 'income') || !t.isConnected || tab === 'summary') return;
  t.style.color = ''; hidePop();
  const link = linkedList(t);
  t.value = link ? fmt(needsRowValue(rowCtx(t).rows[rowCtx(t).i], doc.months[tab])) : amtShow(modelValue(t));
});

// Paste a column (or two columns: amount, note) from a spreadsheet into an amount cell.
view.addEventListener('paste', (e) => {
  const t = e.target;
  if (!t.classList.contains('amt')) return;
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
});

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]'); if (!b) return;
  tab = b.dataset.tab === 'summary' ? 'summary' : Number(b.dataset.tab);
  store.set('ledgy.tab', String(tab));
  render();
});
$('#yearSelect').addEventListener('change', (e) => loadYear(Number(e.target.value)));
$('#exportBtn').addEventListener('click', async (e) => { e.preventDefault(); await flush(); location.href = $('#exportBtn').href; });

/* ---------- Dialogs ---------- */
// Material 3 basic dialog in place of confirm()/alert(). Resolves true on the confirming action, false on cancel, Esc or scrim click.
function askDialog({ title, text, ok = 'OK', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const d = $('#msgDlg');
    $('#msgTitle').textContent = title; $('#msgText').textContent = text;
    const okBtn = $('#msgOk'); okBtn.textContent = ok; okBtn.className = `btn ${danger ? 'danger' : 'primary'}`;
    $('#msgCancel').hidden = cancel === null; $('#msgCancel').textContent = cancel ?? '';
    d.returnValue = '';
    d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true });
    d.showModal();
  });
}
$('#msgDlg').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(''); });

let listEditing = null; // the list being edited in #listDlg, or null for a new one
$('#listForm').addEventListener('submit', (e) => {
  if (e.submitter?.value === 'cancel') return;
  const f = e.target; const m = doc.months[tab];
  const title = f.elements.title.value.trim().slice(0, 60); const group = f.elements.group.value;
  if (!title) return;
  if (sumLists().some((l) => l.key !== listEditing?.key && l.title.toLowerCase() === title.toLowerCase())) {
    e.preventDefault(); askDialog({ title: 'Name already used', text: `${monthLabel(tab)} already has a list named “${title}”. Choose a different name.`, cancel: null }); return;
  }
  if (listEditing) {
    if (listEditing.group !== group) { // rows in the old column can no longer link to it
      for (const g of LINKABLE) for (const r of m[g]) if (r.kind === listEditing.key) { r.kind = 'manual'; r.amount = null; }
    }
    Object.assign(listEditing, { title, group });
  } else (m.sections ||= []).push({ key: `x${Date.now().toString(36)}`, title, group });
  scheduleSave(); renderMonth();
});
function openImport() {
  $('#importMsg').innerHTML = '';
  $('#importYear').value = doc?.year ?? new Date().getFullYear();
  $('#importFile').value = '';
  $('#importGo').disabled = false;
  $('#importDlg').showModal();
}
$('#importBtn').addEventListener('click', openImport);
$('#importForm').addEventListener('submit', async (e) => {
  if (e.submitter?.value === 'cancel') return;
  e.preventDefault();
  const file = $('#importFile').files[0]; const y = Number($('#importYear').value);
  if (!file || !y) return;
  const msg = $('#importMsg'); msg.textContent = 'Importing…'; $('#importGo').disabled = true;
  const send = (overwrite) => fetch(`/api/years/${y}/import${overwrite ? '?overwrite=1' : ''}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
  try {
    await flush();
    let res = await send(false);
    if (res.status === 409) {
      if (!await askDialog({ title: `Replace ${y}?`, text: `${y} already has data. Importing this file replaces it.`, ok: 'Replace', danger: true })) { msg.textContent = 'Import cancelled.'; $('#importGo').disabled = false; return; }
      res = await send(true);
    }
    const body = await res.json();
    if (!res.ok) throw new Error(body.error);
    msg.innerHTML = `<strong>Imported ${y}.</strong>${body.warnings.length ? `<ul>${body.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`;
    await loadYears(y);
  } catch (err) {
    msg.innerHTML = `<span class="err">${esc(err.message)}</span>`;
  }
  $('#importGo').disabled = false;
});

function openNew() {
  const max = years.length ? Math.max(...years.map((y) => y.year)) : new Date().getFullYear() - 1;
  $('#newYear').value = max + 1;
  $('#newFrom').innerHTML = '<option value="">Blank template</option>' + years.map((y) => `<option value="${y.year}" ${y.year === max ? 'selected' : ''}>Copy layout from ${y.year}</option>`).join('');
  $('#newDlg').showModal();
}
$('#newYearBtn').addEventListener('click', openNew);
$('#newForm').addEventListener('submit', async (e) => {
  if (e.submitter?.value === 'cancel') return;
  const y = Number($('#newYear').value); const from = $('#newFrom').value;
  try {
    await flush();
    await api(`/api/years/${y}`, { method: 'POST', body: JSON.stringify({ from: from ? Number(from) : null }) });
    await loadYears(y);
  } catch (err) { askDialog({ title: err.status === 409 ? `${y} already exists` : 'Could not create the year', text: err.status === 409 ? 'Pick a different year, or select it from the year menu.' : err.message, cancel: null }); }
});

let draftColors = {};
const toHex = (c) => {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  const ctx = document.createElement('canvas').getContext('2d'); ctx.fillStyle = c; return ctx.fillStyle;
};
$('#settingsForm').addEventListener('input', (e) => {
  if (e.target.dataset.cssvar) draftColors[e.target.dataset.cssvar] = e.target.value;
});
$('#resetColors').addEventListener('click', () => {
  const f = $('#settingsForm'); draftColors = {};
  const saved = prefs.colors; prefs.colors = {}; applyPrefs();
  for (const [v] of COLOR_PREFS) f[`color${v}`].value = toHex(cssVar(v));
  prefs.colors = saved; applyPrefs();
});
$('#settingsBtn').addEventListener('click', () => {
  const f = $('#settingsForm'); const s = doc.settings;
  $('#setYearLbl').textContent = doc.year;
  f.wantsRate.value = +(s.wantsRate * 100).toFixed(6);
  f.needsRate.value = +(s.needsRate * 100).toFixed(6);
  f.savingsRate.value = +(s.savingsRate * 100).toFixed(6);
  f.needsExtra.value = s.needsExtra; f.rothStart.value = s.rothStart;
  f.limit401k.value = s.limit401k || 0; f.limitHsa.value = s.limitHsa || 0; f.limitRoth.value = s.limitRoth || 0;
  $('#backupLink').href = `/api/years/${doc.year}/backup.json`;
  f.theme.value = prefs.theme; f.monthStyle.value = prefs.monthStyle;
  draftColors = { ...prefs.colors };
  for (const [v] of COLOR_PREFS) f[`color${v}`].value = toHex(draftColors[v] || cssVar(v));
  $('#settingsDlg').showModal();
});
$('#settingsForm').addEventListener('submit', (e) => {
  if (e.submitter?.value === 'cancel') return;
  const f = e.target; const num = (v, d) => (v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
  const s = doc.settings;
  doc.settings = {
    ...s,
    wantsRate: num(f.wantsRate.value, s.wantsRate * 100) / 100,
    needsRate: num(f.needsRate.value, s.needsRate * 100) / 100,
    savingsRate: num(f.savingsRate.value, s.savingsRate * 100) / 100,
    needsExtra: num(f.needsExtra.value, s.needsExtra), rothStart: num(f.rothStart.value, s.rothStart),
    limit401k: Math.max(0, num(f.limit401k.value, s.limit401k || 0)), limitHsa: Math.max(0, num(f.limitHsa.value, s.limitHsa || 0)),
    limitRoth: Math.max(0, num(f.limitRoth.value, s.limitRoth || 0)),
  };
  prefs = { theme: f.theme.value, monthStyle: f.monthStyle.value, colors: draftColors };
  store.set('ledgy.prefs', JSON.stringify(prefs)); applyPrefs();
  scheduleSave(); render();
});
$('#deleteYearBtn').addEventListener('click', async () => {
  if (!await askDialog({ title: `Delete ${doc.year}?`, text: 'All data for this year will be permanently deleted. This cannot be undone. Export a copy first if you need one.', ok: 'Delete', danger: true })) return;
  await flush();
  await api(`/api/years/${doc.year}`, { method: 'DELETE' });
  $('#settingsDlg').close(); doc = null; dirty = false;
  await loadYears();
});

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => doc && render());
// Charts draw text on canvas, so redraw once the web font is ready.
document.fonts?.ready.then(() => doc && render());

loadYears().catch((e) => { $('#view').innerHTML = `<div class="empty"><h1>Cannot reach the server</h1><p class="muted">${esc(e.message)}</p></div>`; });
