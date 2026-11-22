// The month view's chart: spending breakdown (doughnut; Savings and Needs drill into their rows).
import { $ } from './dom.js';
import { icon } from './icons.js';
import { usd } from './format.js';
import { cssVar } from './colors.js';
import { state } from './state.js';
import { charts, chartTheme, tooltip, centerText, ringDataset, paintRing, drillHandlers, legendRow, legendTotal, drillAttrs, savingsBreakdown, needsBreakdown } from './charts.js';

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
      ...drillHandlers((label) => state.donutDrill || label === 'Savings' || label === 'Needs', toggleDonut),
      plugins: {
        tooltip: tooltip((ctx) => ` ${ctx.label}: ${usd(ctx.raw)}`),
        centerText: { lines: null },
      },
    },
    plugins: [centerText],
  });
}

function updateDonut(m, c) {
  const sav = savingsBreakdown([m]);
  const need = needsBreakdown(m);
  const rows = { savings: sav, needs: need };
  if (state.donutDrill && !rows[state.donutDrill].length) state.donutDrill = false;
  const drill = state.donutDrill;
  const name = drill === 'needs' ? 'Needs' : 'Savings';
  const drillTotal = drill === 'needs' ? c.needsTotal : c.savingsTotal;
  const parts = drill ? rows[drill] : donutData(c);
  const taxesOff = state.hideTaxes && !drill && c.taxes > 0;
  const shown = parts.map((p) => (taxesOff && p.label === 'Taxes' ? 0 : Math.max(0, p.value)));
  const gross = taxesOff ? c.gross - c.taxes : c.gross;
  const base = drill ? drillTotal : c.hasIncome && gross > 0 ? gross : shown.reduce((a, b) => a + b, 0);
  charts.donut.options.plugins.centerText.lines = drill ? [name, usd(drillTotal)] : [taxesOff ? 'Income after taxes' : 'Gross income', usd(gross)];
  paintRing(charts.donut, parts, shown);

  const sub = $('#donutSub');
  if (drill) sub.innerHTML = `<button type="button" class="btn ghost" data-drill="donut">${icon('arrow-left')}<span class="lbl">All categories</span></button>`;
  else {
    sub.textContent = c.hasIncome
      ? (c.remaining < -0.005 ? `Over income by ${usd(-c.remaining)}.` : `Share of ${taxesOff ? 'income after taxes' : 'gross income'} ${usd(gross)}.`)
      : 'No income entered. Shares are of the total allocated.';
    if (sav.length || need.length) sub.append(` Click ${[sav.length && 'Savings', need.length && 'Needs'].filter(Boolean).join(' or ')} for ${sav.length && need.length ? 'a' : 'its'} breakdown.`);
  }
  const attrs = (p) => {
    if (drill) return '';
    if (p.label === 'Savings' && sav.length) return drillAttrs('donut', 'savings');
    if (p.label === 'Needs' && need.length) return drillAttrs('donut', 'needs');
    if (p.label === 'Taxes') return ` class="drillable" data-toggle="taxes" tabindex="0" role="button" aria-pressed="${!state.hideTaxes}" title="${state.hideTaxes ? 'Show' : 'Hide'} taxes"`;
    return '';
  };
  $('#donutLegend').innerHTML = parts.map((p) => legendRow(p, base ? p.value / base : null, attrs(p))).join('')
    + (drill ? legendTotal(drillTotal) : '');
}

export function updateMonthCharts(m, c) {
  if (!charts.donut) return;
  updateDonut(m, c);
}
