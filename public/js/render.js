// Draws the open year: the month tabs and either a month or the Summary. Also loads years from the server.
import { MONTHS, calcDrawdown } from '/lib/calc.js';
import { $, store } from './dom.js';
import { api } from './api.js';
import { state, onSummary } from './state.js';
import { monthLabel } from './prefs.js';
import { flush, setSaveState, showBanner } from './save.js';
import { destroyCharts } from './charts.js';
import { renderMonth } from './month.js';
import { renderSummary } from './summary.js';

const emptyState = () => `<div class="empty">
    <h1>No budget yet</h1>
    <p class="muted">Import your spreadsheet to bring in all months, or start a blank year. Each month uses the same layout: Wants, Needs and Savings with budgets from your income.</p>
    <div class="btns"><button class="btn primary" data-act="import">Import</button><button class="btn tonal" data-act="new">Start a new year</button></div>
  </div>`;

export function render() {
  destroyCharts();
  const { doc } = state;
  $('#settingsBtn').hidden = !doc;
  $('#incomeBtn').hidden = !doc;
  $('#providersBtn').hidden = !doc;
  if (!doc) { $('#tabs').innerHTML = ''; $('#view').innerHTML = emptyState(); return; }
  $('#exportBtn').href = `/api/years/${doc.year}/export.xlsx`;
  renderTabs();
  if (onSummary()) renderSummary(); else renderMonth();
}

// Month tabs carry a dot when the month runs over income (amber when savings cover it).
export function renderTabs() {
  const draw = calcDrawdown(state.doc);
  const tab = (key, label, extra = '') => `<button class="tab${key === 'summary' ? ' sum' : ''}" role="tab" data-tab="${key}" aria-selected="${state.tab === key}"${extra}>${label}</button>`;
  $('#tabs').innerHTML = MONTHS.map((_, i) => {
    const { over, covered } = draw[i];
    const note = covered ? 'Over income, covered by savings' : over ? 'Over income' : '';
    return tab(i, `${monthLabel(i)}${over ? `<span class="dot${covered ? ' warn' : ''}" aria-label="${note.toLowerCase()}"></span>` : ''}`, ` title="${note}"`);
  }).join('') + tab('summary', 'Summary');
}

export function setTab(t) {
  state.tab = t; state.donutDrill = false;
  store.set('ledgy.tab', String(t));
  render();
}

export async function loadYears(select) {
  state.years = await api('/api/years');
  const sel = $('#yearSelect');
  sel.innerHTML = state.years.map((y) => `<option value="${y.year}">${y.year}</option>`).join('');
  sel.hidden = !state.years.length;
  const want = select ?? Number(store.get('ledgy.year'));
  const pick = state.years.find((y) => y.year === want) || state.years[state.years.length - 1];
  if (pick) { sel.value = pick.year; await loadYear(pick.year); } else { state.doc = null; render(); }
}

// Open a year on the current month (this year), or the tab used last.
async function loadYear(y) {
  await flush();
  state.doc = await api(`/api/years/${y}`);
  store.set('ledgy.year', String(y));
  const now = new Date();
  const saved = store.get('ledgy.tab');
  let tab = saved === 'summary' ? 'summary' : (state.doc.year === now.getFullYear() ? now.getMonth() : Number(saved) || 0);
  if (!(tab === 'summary' || (tab >= 0 && tab < 12))) tab = 0;
  state.tab = tab;
  setSaveState('Saved'); showBanner('');
  render();
}

export function initHeader() {
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    setTab(b.dataset.tab === 'summary' ? 'summary' : Number(b.dataset.tab));
  });
  $('#yearSelect').addEventListener('change', (e) => loadYear(Number(e.target.value)));
  $('#exportBtn').addEventListener('click', async (e) => { e.preventDefault(); await flush(); location.href = $('#exportBtn').href; });
}
