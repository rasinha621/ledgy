// The month view's charts: spending breakdown (doughnut, Savings drills into its rows) and Needs by line.
import { needsRowValue } from '/lib/calc.js';
import { $ } from './dom.js';
import { usd } from './format.js';
import { cssVar } from './colors.js';
import { state } from './state.js';
import { charts, chartTheme, tooltip, centerText, ringDataset, paintRing, drillHandlers, legendRow, legendTotal, drillAttrs, savingsBreakdown } from './charts.js';

function donutData(c) {
  const parts = [
    ...(c.taxes > 0 ? [{ label: 'Taxes', value: c.taxes, color: cssVar('--muted') }] : []),
    { label: 'Wants', value: c.wantsTotal, color: cssVar('--wants') },
    { label: 'Needs', value: c.needsTotal, color: cssVar('--needs') },
    { label: 'Savings', value: c.savingsTotal, color: cssVar('--savings') },
  ];
  if (c.hasIncome && c.remaining > 0.005) parts.push({ label: 'Unallocated', value: c.remaining, color: cssVar('--free') });
  return parts;
}

export function buildMonthCharts(toggleDonut) {
  chartTheme();
  charts.donut = new Chart($('#donut'), {
    type: 'doughnut',
    data: { labels: [], datasets: [ringDataset({ hoverOffset: 4 })] },
    options: {
      cutout: '68%', animation: { duration: 250 },
      ...drillHandlers((label) => state.donutDrill || label === 'Savings', toggleDonut),
      plugins: {
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
      indexAxis: 'y', animation: { duration: 250 },
      plugins: { tooltip: tooltip((ctx) => ` ${usd(ctx.raw)}`) },
      scales: {
        x: { grid: { color: cssVar('--line') }, border: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12, callback: (v) => (Math.abs(v) >= 1000 ? `$${+(v / 1000).toFixed(1)}k` : `$${v}`) } },
        y: { grid: { display: false }, border: { display: false } },
      },
    },
  });
}

function updateDonut(m, c) {
  const sav = savingsBreakdown([m]);
  if (!sav.length) state.donutDrill = false;
  const drill = state.donutDrill;
  const parts = drill ? sav : donutData(c);
  const taxesOff = state.hideTaxes && !drill && c.taxes > 0;
  const shown = parts.map((p) => (taxesOff && p.label === 'Taxes' ? 0 : Math.max(0, p.value)));
  const gross = taxesOff ? c.gross - c.taxes : c.gross;
  const base = drill ? c.savingsTotal : c.hasIncome && gross > 0 ? gross : shown.reduce((a, b) => a + b, 0);
  charts.donut.options.plugins.centerText.lines = drill ? ['Savings', usd(c.savingsTotal)] : [taxesOff ? 'Income after taxes' : 'Gross income', usd(gross)];
  paintRing(charts.donut, parts, shown);

  const sub = $('#donutSub');
  if (drill) sub.innerHTML = '<button type="button" class="btn ghost" data-drill="donut">← All categories</button>';
  else {
    sub.textContent = c.hasIncome
      ? (c.remaining < -0.005 ? `Over income by ${usd(-c.remaining)}.` : `Share of ${taxesOff ? 'income after taxes' : 'gross income'} ${usd(gross)}.`)
      : 'No income entered. Shares are of the total allocated.';
    if (sav.length) sub.append(' Click Savings for its breakdown.');
  }
  const attrs = (p) => {
    if (drill) return '';
    if (p.label === 'Savings' && sav.length) return drillAttrs('donut');
    if (p.label === 'Taxes') return ` class="drillable" data-toggle="taxes" tabindex="0" role="button" aria-pressed="${!state.hideTaxes}" title="${state.hideTaxes ? 'Show' : 'Hide'} taxes"`;
    return '';
  };
  $('#donutLegend').innerHTML = parts.map((p) => legendRow(p, base ? p.value / base : null, attrs(p))).join('')
    + (drill ? legendTotal(c.savingsTotal) : '');
}

function updateNeedsBar(m) {
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

export function updateMonthCharts(m, c) {
  if (!charts.donut) return;
  updateDonut(m, c);
  updateNeedsBar(m);
}
