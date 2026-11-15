// Autosave: changes are sent a moment after the last edit. A 409 means another window saved first.
import { $ } from './dom.js';
import { api } from './api.js';
import { state } from './state.js';

let saveTimer = null; let saving = null; let dirty = false;

export function setSaveState(text, err = false) { const el = $('#saveState'); el.textContent = text; el.classList.toggle('err', err); }
export function showBanner(html) { const b = $('#banner'); b.innerHTML = html; b.hidden = !html; }

export function scheduleSave() {
  dirty = true; setSaveState('Not saved');
  clearTimeout(saveTimer); saveTimer = setTimeout(flush, 600);
}

// Forget unsaved changes (the year was deleted).
export function discardChanges() { clearTimeout(saveTimer); dirty = false; }

export async function flush() {
  clearTimeout(saveTimer);
  if (saving) { await saving; if (!dirty) return; }
  const { doc } = state;
  if (!dirty || !doc) return;
  dirty = false; setSaveState('Saving…');
  saving = api(`/api/years/${doc.year}`, { method: 'PUT', body: JSON.stringify(doc) })
    .then((saved) => { doc.updatedAt = saved.updatedAt; if (!dirty) setSaveState('Saved'); })
    .catch((e) => {
      setSaveState('Not saved', true);
      if (e.status === 409) showBanner(`${e.message} <button class="btn" id="reloadBtn">Reload</button>`);
      else { dirty = true; saveTimer = setTimeout(flush, 4000); }
    })
    .finally(() => { saving = null; });
  await saving;
}

export function initSave() {
  window.addEventListener('beforeunload', (e) => { if (dirty) { flush(); e.preventDefault(); } });
  document.addEventListener('click', (e) => { if (e.target.id === 'reloadBtn') location.reload(); });
}
