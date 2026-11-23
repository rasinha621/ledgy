// The settings dialog: budget rates, limits, savings goals and data. The per-browser look is in custom.js.
import { syncGoals } from '/lib/calc.js';
import { $, cancelled } from './dom.js';
import { api } from './api.js';
import { state } from './state.js';
import { savePrefs } from './prefs.js';
import { flush, scheduleSave, discardChanges } from './save.js';
import { render, loadYears } from './render.js';
import { askDialog } from './dialogs.js';
import { resetGoals, draftGoals, pruneCols, initGoalsPanel } from './goals-panel.js';
import { applyIncome } from './income-panel.js';

const form = () => $('#settingsForm');
const RATES = ['wantsRate', 'needsRate', 'savingsRate'];
const LIMITS = ['limit401k', 'limitHsa', 'limitRoth'];

export function openSettings() {
  const f = form(); const { doc } = state; const s = doc.settings;
  $('#setYearLbl').textContent = doc.year;
  for (const k of RATES) f[k].value = +(s[k] * 100).toFixed(6);
  for (const k of LIMITS) f[k].value = s[k] || 0;
  f.rothStart.value = s.rothStart;
  f.savingsDrawdown.value = s.savingsDrawdown ? 'yes' : 'no';
  $('#backupLink').href = `/api/years/${doc.year}/backup.json`;
  resetGoals(s.goals);
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
  savePrefs({ ...state.prefs, savingsCols: pruneCols(state.prefs.savingsCols, doc.settings.goals) });
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
  initGoalsPanel();
  f.addEventListener('submit', onSubmit);
  $('#helpBtn').addEventListener('click', () => $('#helpDlg').showModal());
  $('#helpClose').addEventListener('click', () => $('#helpDlg').close());
  $('#settingsBtn').addEventListener('click', () => openSettings());
  $('#settingsClose').addEventListener('click', () => $('#settingsDlg').close());
  $('#deleteYearBtn').addEventListener('click', deleteYear);

  // Sign out only applies when the server has a login.
  fetch('/api/auth').then((r) => { $('#signOutBtn').hidden = !r.ok; }).catch(() => {});
  $('#signOutBtn').addEventListener('click', async () => {
    await api('/logout', { method: 'POST' }).catch(() => {});
    location.href = '/login';
  });
}
