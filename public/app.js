// Ledgy in the browser. The pieces live in /js; this file wires them up and loads the first year.
import { $, esc } from './js/dom.js';
import { state } from './js/state.js';
import { initPrefs, applyPrefs } from './js/prefs.js';
import { initSave } from './js/save.js';
import { render, loadYears, initHeader } from './js/render.js';
import { initMonthEvents } from './js/month-events.js';
import { initPicker } from './js/picker.js';
import { initSummary } from './js/summary.js';
import { initDialogs } from './js/dialogs.js';
import { initYearDialogs } from './js/year-dialogs.js';
import { initSettings } from './js/settings.js';
import { initTooltips } from './js/tooltips.js';

initPrefs();
initSave();
initHeader();
initMonthEvents();
initPicker();
initSummary();
initDialogs();
initYearDialogs();
initSettings();
initTooltips();

// Theme colors are resolved into the charts when they are drawn, so redraw when the system theme changes.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyPrefs(); if (state.doc) render(); });
// Charts draw text on canvas, so redraw once the web font is ready.
document.fonts?.ready.then(() => state.doc && render());

loadYears().catch((e) => { $('#view').innerHTML = `<div class="empty"><h1>Cannot reach the server</h1><p class="muted">${esc(e.message)}</p></div>`; });
