// The Customization dialog: the per-browser look (theme, layout, labels, theme color) and the Summary's savings columns.
// Changes preview live and are dropped again on Cancel or Escape.
import { $, cancelled } from './dom.js';
import { state } from './state.js';
import { applyPrefs, savePrefs } from './prefs.js';
import { render } from './render.js';
import { draftSeed, resetSeedPicker, initSeedPicker } from './seed-picker.js';
import { resetCols, draftCols, initColsPanel } from './goals-panel.js';

const form = () => $('#customForm');
const LOOK = ['theme', 'density', 'monthStyle', 'listLayout', 'entryStyle', 'labels'];

// The look chosen in the form right now (not saved yet).
const draftLook = () => {
  const f = form();
  return { ...Object.fromEntries(LOOK.map((k) => [k, f[k].value])), seed: draftSeed() };
};
const previewDraft = () => applyPrefs({ ...state.prefs, ...draftLook() });

export function openCustom() {
  const f = form(); const { doc, prefs } = state;
  for (const k of LOOK) f[k].value = prefs[k];
  resetCols(doc.settings.goals, prefs.savingsCols);
  resetSeedPicker(prefs.seed);
  $('#customDlg').showModal();
}

function onSubmit(e) {
  if (cancelled(e)) return;
  savePrefs({ ...draftLook(), savingsCols: draftCols() });
  render();
}

export function initCustom() {
  const f = form();
  initSeedPicker(previewDraft);
  initColsPanel();
  for (const k of ['theme', 'density', 'entryStyle', 'labels']) f[k].addEventListener('change', previewDraft);
  f.addEventListener('submit', onSubmit);
  // Cancel, Escape or Save: drop the live preview and use the saved preferences.
  $('#customDlg').addEventListener('close', () => applyPrefs());
  $('#customBtn').addEventListener('click', openCustom);
  $('#customClose').addEventListener('click', () => $('#customDlg').close());
}
