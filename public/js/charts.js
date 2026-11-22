// Shared Chart.js setup: theme, card-style tooltips, ring charts with a clickable Savings slice, and legends.
// Chart is the global from /vendor/chart.umd.js.
import { DEFAULT_SAVINGS, needsRowValue, round2 } from '/lib/calc.js';
import { esc } from './dom.js';
import { usd, pct } from './format.js';
import { cssVar, savingsShades, shades } from './colors.js';

export const charts = {}; // live charts of the current view, by name

const chartTip = Object.assign(document.createElement('div'), { id: 'chartTip', role: 'tooltip' });
document.body.append(chartTip);

export function destroyCharts() {
  chartTip.classList.remove('on');
  for (const [k, c] of Object.entries(charts)) { c.destroy(); delete charts[k]; }
}

export function chartTheme() {
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 12;
  Chart.defaults.color = cssVar('--text-2');
  Chart.defaults.borderColor = cssVar('--line');
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.plugins.legend.display = false; // every chart draws its own legend in HTML
}

// Hover tooltips are cards: a heading line plus one line per value.
function externalTip({ chart, tooltip: t }) {
  if (t.opacity === 0) { chartTip.classList.remove('on'); return; }
  const rows = (t.body || []).flatMap((b, i) => b.lines.map((text) => ({ text, color: t.labelColors?.[i]?.backgroundColor })));
  chartTip.innerHTML = `${t.title?.length ? `<div class="tip-h">${esc(t.title.join(' '))}</div>` : ''}`
    + rows.map((r) => `<div class="tip-r">${r.color ? `<span class="swatch" style="background:${typeof r.color === 'string' ? r.color : ''}"></span>` : ''}<span>${esc(r.text.trim())}</span></div>`).join('');
  const box = chart.canvas.getBoundingClientRect(); const w = chartTip.offsetWidth; const h = chartTip.offsetHeight;
  const x = box.left + t.caretX; const y = box.top + t.caretY;
  chartTip.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, x + 12 + w > innerWidth - 8 ? x - w - 12 : x + 12))}px`;
  chartTip.style.top = `${Math.max(8, Math.min(innerHeight - h - 8, y - h / 2))}px`;
  chartTip.classList.add('on');
}
export const tooltip = (label) => ({ enabled: false, external: externalTip, callbacks: { label } });

// Two lines of text in the middle of a doughnut: options.plugins.centerText.lines = [caption, value].
export const centerText = {
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

// The one dataset of a pie or doughnut. Slices are filled in by paintRing.
export const ringDataset = (extra = {}) => ({ data: [], backgroundColor: [], borderColor: cssVar('--surface'), borderWidth: 2, ...extra });
export function paintRing(chart, parts, values = parts.map((p) => Math.max(0, p.value))) {
  const ds = chart.data.datasets[0];
  chart.data.labels = parts.map((p) => p.label);
  ds.data = values; ds.backgroundColor = parts.map((p) => p.color);
  chart.update();
}

// Click and hover handlers for a chart where some slices toggle a drill-down. canToggle gets the slice label.
export const drillHandlers = (canToggle, toggle) => {
  const label = (els, chart) => chart.data.labels[els[0]?.index];
  return {
    onClick: (_e, els, chart) => { const l = label(els, chart); if (canToggle(l)) toggle(l); },
    onHover: (_e, els, chart) => { chart.canvas.style.cursor = canToggle(label(els, chart)) ? 'pointer' : 'default'; },
  };
};

// HTML legend rows: swatch, label, amount and share. attrs makes a row clickable (see drillAttrs).
export const legendRow = ({ label, value, color }, share, attrs = '') => `<div${attrs}><span class="swatch" style="background:${color}"></span><span>${esc(label)}</span><span>${usd(value)}</span><span class="pct">${share === null ? '—' : pct(share)}</span></div>`;
export const legendTotal = (total) => `<div class="legend-total"><span></span><span>Total</span><span>${usd(total)}</span><span class="pct">${total ? '100.00%' : '—'}</span></div>`;
export const drillAttrs = (name, kind = '') => ` class="drillable" data-drill="${name}"${kind ? ` data-kind="${kind}"` : ''} tabindex="0" role="button"`;

// One month's needs rows, largest first, with the same shading as the savings breakdown.
export function needsBreakdown(m) {
  const items = m.needs.map((r, i) => ({ label: r.label.trim() || `Row ${i + 2}`, value: round2(needsRowValue(r, m)) }))
    .filter((l) => l.value > 0).sort((a, b) => b.value - a.value);
  const colors = shades('--needs', items.length);
  return items.map((l, i) => ({ ...l, color: colors[i] }));
}

// Savings rows summed across the given months, grouped like the Summary table: the first five rows by position
// (401k, HSA, Roth, Cash, Investing, whatever a month calls them) and any extra rows by label, largest first.
// Negative rows (withdrawals) are kept so the list adds up to the Savings total.
export function savingsBreakdown(months) {
  const by = new Map();
  for (const m of months) {
    m.savings.forEach((r, i) => {
      const fixed = i < DEFAULT_SAVINGS.length;
      const label = fixed ? DEFAULT_SAVINGS[i] : r.label.trim() || `Row ${i + 2}`; const k = fixed ? `#${i}` : label.toLowerCase();
      by.set(k, { label: by.get(k)?.label ?? label, value: (by.get(k)?.value ?? 0) + needsRowValue(r, m) });
    });
  }
  const items = [...by.values()].map((l) => ({ ...l, value: round2(l.value) })).filter((l) => l.value !== 0).sort((a, b) => b.value - a.value);
  const colors = savingsShades(items.length);
  return items.map((l, i) => ({ ...l, color: l.value < 0 ? cssVar('--over') : colors[i] }));
}
