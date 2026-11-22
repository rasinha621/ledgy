// The settings dialog: budget rates and limits (Data), and per-browser look (Customize).
// Customize changes preview live and are dropped again on Cancel or Escape.
import { syncGoals } from '/lib/calc.js';
import { $, $$, cancelled } from './dom.js';
import { api } from './api.js';
import { state } from './state.js';
import { applyPrefs, savePrefs } from './prefs.js';
import { flush, scheduleSave, discardChanges } from './save.js';
import { render, loadYears } from './render.js';
import { askDialog } from './dialogs.js';
import { draftSeed, resetSeedPicker, initSeedPicker } from './seed-picker.js';
import { resetGoals, draftGoals, draftCols, initGoalsPanel } from './goals-panel.js';
import { applyIncome } from './income-panel.js';

const form = () => $('#settingsForm');
const PANELS = { data: '#setPanelData', custom: '#setPanelCustom' };
const RATES = ['wantsRate', 'needsRate', 'savingsRate'];
const LIMITS = ['limit401k', 'limitHsa', 'limitRoth'];
const LOOK = ['theme', 'density', 'monthStyle', 'entryStyle', 'labels'];

function showSettingsTab(name) {
  $$('#settingsDlg .set-tab').forEach((t) => { const on = t.dataset.tab === name; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; });
  for (const [k, sel] of Object.entries(PANELS)) $(sel).hidden = k !== name;
}

// The look chosen in the form right now (not saved yet).
const draftLook = () => {
  const f = form();
  return { ...Object.fromEntries(LOOK.map((k) => [k, f[k].value])), seed: draftSeed() };
};
const previewDraft = () => applyPrefs({ ...state.prefs, ...draftLook() });

export function openSettings(tabName = 'data') {
  showSettingsTab(tabName);
  const f = form(); const { doc, prefs } = state; const s = doc.settings;
  $('#setYearLbl').textContent = doc.year;
  for (const k of RATES) f[k].value = +(s[k] * 100).toFixed(6);
  for (const k of LIMITS) f[k].value = s[k] || 0;
  f.rothStart.value = s.rothStart;
  f.savingsDrawdown.value = s.savingsDrawdown ? 'yes' : 'no';
  for (const k of LOOK) f[k].value = prefs[k];
  $('#backupLink').href = `/api/years/${doc.year}/backup.json`;
  resetGoals(s.goals, prefs.savingsCols);
  resetSeedPicker(prefs.seed);
  f.payPeriod.value = s.payPeriod || 'monthly';
  $('#settingsDlg').showModal();
}

function onSubmit(e) {
  if (cancelled(e)) return;
  const f = e.target; const { doc } = state; const s = doc.settings;
  const num = (v, d) => (v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
  doc.settings = {
    ...s,
    ...Object.fromEntries(RATES.map((k) => [k, num(f[k].value, s[k] * 100) / 100])),
    ...Object.fromEntries(LIMITS.map((k) => [k, Math.max(0, num(f[k].value, s[k] || 0))])),
    rothStart: num(f.rothStart.value, s.rothStart),
    payPeriod: f.payPeriod.value,
    savingsDrawdown: f.savingsDrawdown.value === 'yes',
    goals: draftGoals(),
  };
  syncGoals(doc);
  applyIncome(doc, f.payPeriod.value);
  savePrefs({ ...draftLook(), savingsCols: draftCols(doc.settings.goals) });
  scheduleSave(); render();
}

async function deleteYear() {
  const { doc } = state;
  if (!await askDialog({ title: `Delete ${doc.year}?`, text: 'All data for this year will be permanently deleted. This cannot be undone. Export a copy first if you need one.', ok: 'Delete', danger: true })) return;
  await flush();
  await api(`/api/years/${doc.year}`, { method: 'DELETE' });
  $('#settingsDlg').close(); state.doc = null; discardChanges();
  await loadYears();
}

export function initSettings() {
  const f = form();
  initSeedPicker(previewDraft);
  initGoalsPanel();
  for (const k of ['theme', 'density', 'entryStyle', 'labels']) f[k].addEventListener('change', previewDraft);
  f.addEventListener('submit', onSubmit);
  // Cancel, Escape or Save: drop the live preview and use the saved preferences.
  $('#settingsDlg').addEventListener('close', () => applyPrefs());
  $('#helpBtn').addEventListener('click', () => $('#helpDlg').showModal());
  $('#helpClose').addEventListener('click', () => $('#helpDlg').close());
  $('#settingsBtn').addEventListener('click', () => openSettings());
  $('#settingsClose').addEventListener('click', () => $('#settingsDlg').close());
  $('#deleteYearBtn').addEventListener('click', deleteYear);

  const tabs = $('#settingsDlg .set-tabs');
  tabs.addEventListener('click', (e) => { const t = e.target.closest('.set-tab'); if (t) showSettingsTab(t.dataset.tab); });
  tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const all = $$('#settingsDlg .set-tab');
    const cur = all.findIndex((t) => t.getAttribute('aria-selected') === 'true');
    const next = all[(cur + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length]; showSettingsTab(next.dataset.tab); next.focus();
  });

  // Sign out only applies when the server has a login.
  fetch('/api/auth').then((r) => { $('#signOutBtn').hidden = !r.ok; }).catch(() => {});
  $('#signOutBtn').addEventListener('click', async () => {
    await api('/logout', { method: 'POST' }).catch(() => {});
    location.href = '/login';
  });
}
