// Per-browser preferences: theme, density, month names, list layout, entry style, button labels, Summary columns and the seed color.
import { syncIcon } from '/icon.js';
import { isHex, applySeed } from '/seed.js';
import { MONTHS } from '/lib/calc.js';
import { store } from './dom.js';
import { state } from './state.js';

const KEY = 'ledgy.prefs';
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_STYLES = {
  upper: (i) => MONTHS[i],                                                  // JAN
  title: (i) => FULL_MONTHS[i].slice(0, 3),                                 // Jan
  num: (i, year) => `${String(i + 1).padStart(2, '0')}/${String(year).slice(-2)}`, // 01/26
  full: (i) => FULL_MONTHS[i],                                              // January
};
// One seed color generates the accent, tinted surfaces and chart colors (see seed.js and the stylesheet).
export const SEED_PRESETS = ['#6750a4', '#006a6a', '#386a20', '#8b5000', '#a43b5c', '#006874'];
export const DEFAULT_SEED = '#2563eb';
// Optional savings columns in the Summary's top table. The four totals are always shown.
export const SAV_COLS = ['Cash', 'Investing', 'Roth', 'HSA', '401k'];
export const goalCol = (id) => `goal:${id}`;

function loadPrefs() {
  const p = store.getJSON(KEY, {}) || {};
  return {
    theme: ['light', 'dark'].includes(p.theme) ? p.theme : 'auto',
    density: p.density === 'compact' ? 'compact' : 'normal',
    monthStyle: MONTH_STYLES[p.monthStyle] ? p.monthStyle : 'upper',
    labels: ['icons', 'text'].includes(p.labels) ? p.labels : 'both',
    listLayout: p.listLayout === 'none' ? 'none' : 'category',
    entryStyle: p.entryStyle === 'plain' ? 'plain' : 'boxed',
    savingsCols: Array.isArray(p.savingsCols) ? [...SAV_COLS.filter((k) => p.savingsCols.includes(k)), ...p.savingsCols.filter((k) => /^goal:[a-z0-9]{1,16}$/.test(k))] : [],
    seed: isHex(p.seed) ? p.seed.toLowerCase() : null,
  };
}

export const monthLabel = (i) => MONTH_STYLES[state.prefs.monthStyle](i, state.doc?.year ?? new Date().getFullYear());
export const monthLabels = () => MONTHS.map((_, i) => monthLabel(i));

// Apply preferences to the page. Pass a draft to preview it; with no argument the saved preferences are used.
export function applyPrefs(p = state.prefs) {
  const root = document.documentElement;
  const flag = (name, value) => { if (value) root.dataset[name] = value; else delete root.dataset[name]; };
  flag('theme', p.theme !== 'auto' && p.theme);
  flag('density', p.density === 'compact' && 'compact');
  flag('labels', p.labels !== 'both' && p.labels);
  flag('entries', p.entryStyle === 'plain' && 'plain');
  applySeed(root, p.seed);
  syncIcon();
}

export function savePrefs(p) { state.prefs = p; store.setJSON(KEY, p); applyPrefs(); }

export function initPrefs() { state.prefs = loadPrefs(); applyPrefs(); }
