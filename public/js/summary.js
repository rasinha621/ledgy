// The Summary tab: year totals, the year breakdown pie (Total Savings drills into its rows) and spending by month.
import { calcDrawdown, calcSummary } from '/lib/calc.js';
import { $, esc, onActivate } from './dom.js';
import { fmt, usd, pct } from './format.js';
import { cssVar } from './colors.js';
import { state } from './state.js';
import { monthLabel, monthLabels, goalCol } from './prefs.js';
import { charts, chartTheme, tooltip, ringDataset, paintRing, drillHandlers, legendRow, legendTotal, drillAttrs, savingsBreakdown } from './charts.js';

let paintPie = null; // redraws the pie of the current Summary

// A year total, colored against its annual limit or goal target.
function totalCell([, v, limit, goal]) {
  if (!(limit > 0)) return `<td>${usd(v)}</td>`;
  const met = v >= limit - 0.005;
  if (goal) return met ? `<td class="met" title="Goal met">${usd(v)}</td>` : `<td title="Goal ${esc(usd(limit))}">${usd(v)}</td>`;
  if (v > limit + 0.005) return `<td class="over" title="Over the ${esc(usd(limit))} limit">${usd(v)}</td>`;
  if (met) return `<td class="met" title="Annual limit met">${usd(v)}</td>`;
  return `<td title="Limit ${esc(usd(limit))}">${usd(v)}</td>`;
}

function summaryHtml(s) {
  const { settings } = state.doc; const { savingsCols } = state.prefs;
  const cols = [
    ['Total income', s.totalIncome], ['Total Wants', s.totalWants], ['Total Needs', s.totalNeeds],
    ['Total Savings', s.totalSavings], ['Cash', s.cashBalance], ['Investing', s.investingSavings],
    ['Roth', s.roth, settings.limitRoth], ['HSA', s.hsa, settings.limitHsa], ['401k', s.k401, settings.limit401k],
  ].filter(([h], i) => i < 4 || savingsCols.includes(h));
  cols.push(...(s.goals || []).filter((g) => savingsCols.includes(goalCol(g.id))).map((g) => [g.name, g.total, g.target, true]));
  const draw = calcDrawdown(state.doc);
  const over = (p) => (p > 1 ? 'over' : '');
  const rows = s.months.map((c, i) => `<tr data-goto="${i}" style="cursor:pointer">
      <td>${monthLabel(i)}</td><td>${c.hasIncome ? fmt(c.income) : '—'}</td>
      <td>${fmt(c.wantsTotal)}</td><td class="${over(c.wantsPct)}">${pct(c.wantsPct)}</td>
      <td>${fmt(c.needsTotal)}</td><td class="${over(c.needsPct)}">${pct(c.needsPct)}</td>
      <td>${fmt(c.savingsTotal)}</td><td>${pct(c.savingsPct)}</td>
      <td>${fmt(c.allocated)}</td><td class="${draw[i].covered ? 'warn' : c.remaining < -0.005 ? 'over' : ''}">${fmt(c.remaining)}</td></tr>`).join('');
  const total = (k) => fmt(s.months.reduce((t, c) => t + c[k], 0));
  return `
    <section class="card"><div class="table-wrap"><table class="sum-table" style="table-layout:fixed;min-width:${cols.length * 8}rem">
      <thead><tr>${cols.map(([h]) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody><tr>${cols.map(totalCell).join('')}</tr></tbody>
    </table></div></section>
    <div class="summary-grid">
      <section class="card chart-card">
        <h3 id="pieTitle">Year breakdown</h3>
        <div class="chart-box tall"><canvas id="pie" role="img" aria-label="Year breakdown chart"></canvas></div>
        <div class="legend" id="pieLegend"></div>
      </section>
      <section class="card chart-card fill">
        <div class="chart-head"><h3>Spending by month</h3><div class="chart-toggles" id="monthlyToggles"></div></div>
        <div class="chart-box tall"><canvas id="monthly" role="img" aria-label="Spending by month chart"></canvas></div>
      </section>
    </div>
    <section class="card" style="margin-top:16px"><div class="table-wrap"><table>
      <thead><tr><th>Month</th><th>Income</th><th>Wants</th><th>% of budget</th><th>Needs</th><th>% of budget</th><th>Savings</th><th>% of budget</th><th>Allocated</th><th>Remaining</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>Total</td><td>${fmt(s.totalIncome)}</td><td>${fmt(s.totalWants)}</td><td></td><td>${fmt(s.totalNeeds)}</td><td></td>
        <td>${total('savingsTotal')}</td><td></td>
        <td>${total('allocated')}</td><td>${total('remaining')}</td></tr></tfoot>
    </table></div></section>`;
}

function buildPie(s) {
  const breakdown = () => savingsBreakdown(state.doc.months);
  const parts = () => (state.pieDrill ? breakdown() : [
    { label: 'Total Wants', value: s.totalWants, color: cssVar('--wants') },
    { label: 'Total Needs', value: s.totalNeeds, color: cssVar('--needs') },
    { label: 'Total Savings', value: s.totalSavings, color: cssVar('--savings') },
  ]);
  const canDrill = () => !state.pieDrill && breakdown().length > 0;
  paintPie = () => {
    const drill = state.pieDrill; const ps = parts();
    const total = drill ? s.totalSavings : ps.reduce((t, p) => t + Math.max(0, p.value), 0);
    charts.pie.options.plugins.tooltip = tooltip((ctx) => ` ${ctx.label}: ${usd(ctx.raw)} (${total ? pct(ctx.raw / total) : '—'})`);
    paintRing(charts.pie, ps);
    $('#pieTitle').innerHTML = drill ? 'Savings breakdown <button type="button" class="btn ghost" data-drill="pie">← Year breakdown</button>' : 'Year breakdown';
    const drillable = canDrill();
    $('#pieLegend').innerHTML = ps.map((p) => legendRow(p, total ? (drill ? p.value : Math.max(0, p.value)) / total : null, drillable && p.label === 'Total Savings' ? drillAttrs('pie') : '')).join('')
      + (drill ? legendTotal(s.totalSavings) : '');
  };
  state.pieDrill = false;
  charts.pie = new Chart($('#pie'), {
    type: 'pie',
    data: { labels: [], datasets: [ringDataset()] },
    options: drillHandlers((label) => state.pieDrill || (canDrill() && label === 'Total Savings'), togglePie),
  });
  paintPie();
}

function buildMonthly(s) {
  const bar = (label, key, color) => ({ type: 'bar', label, data: s.months.map((c) => Math.max(0, c[key])), backgroundColor: color, stack: 's', borderColor: cssVar('--surface'), borderWidth: { top: 2 }, borderRadius: 3, borderSkipped: 'start', barPercentage: 0.7, categoryPercentage: 0.8 });
  charts.monthly = new Chart($('#monthly'), {
    data: {
      labels: monthLabels(),
      datasets: [
        { type: 'line', label: 'Income', data: s.months.map((c) => (c.hasIncome ? c.income : null)), borderColor: cssVar('--text-2'), borderWidth: 2, borderDash: [5, 4], pointRadius: 4, pointBackgroundColor: cssVar('--surface'), pointBorderWidth: 2, spanGaps: false, order: 0 },
        bar('Wants', 'wantsTotal', cssVar('--wants')), bar('Needs', 'needsTotal', cssVar('--needs')), bar('Savings', 'savingsTotal', cssVar('--savings')),
      ],
    },
    options: {
      interaction: { mode: 'index', intersect: false }, layout: { padding: { top: 8, right: 8, bottom: 8 } },
      plugins: { tooltip: tooltip((ctx) => ` ${ctx.dataset.label}: ${usd(ctx.raw)}`) },
      scales: {
        x: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { padding: 8 } },
        y: { stacked: true, beginAtZero: true, grid: { color: cssVar('--line') }, border: { display: false }, ticks: { padding: 12, callback: (v) => `$${Number(v).toLocaleString('en-US')}` } },
      },
    },
  });
  // Toggle buttons that show or hide each series.
  $('#monthlyToggles').innerHTML = charts.monthly.data.datasets.map((d, i) => `<button type="button" class="chart-toggle" data-i="${i}" aria-pressed="true"><span class="swatch" style="background:${d.type === 'line' ? d.borderColor : d.backgroundColor}"></span>${d.label}</button>`).join('');
  $('#monthlyToggles').onclick = (e) => {
    const b = e.target.closest('.chart-toggle'); if (!b) return;
    const i = +b.dataset.i, on = !charts.monthly.isDatasetVisible(i);
    charts.monthly.setDatasetVisibility(i, on); charts.monthly.update();
    b.setAttribute('aria-pressed', on);
  };
}

function togglePie() { state.pieDrill = !state.pieDrill; paintPie?.(); }

export function renderSummary() {
  const s = calcSummary(state.doc);
  $('#view').innerHTML = summaryHtml(s);
  chartTheme();
  buildPie(s);
  buildMonthly(s);
}

export function initSummary() {
  onActivate($('#view'), '[data-drill="pie"]', togglePie);
}
