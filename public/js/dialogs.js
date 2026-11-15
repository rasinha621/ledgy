// The message dialog (in place of confirm/alert) and the dialog that adds, renames or deletes a month's list.
import { $, cancelled } from './dom.js';
import { state, curMonth } from './state.js';
import { monthLabel } from './prefs.js';
import { sumLists, findSection, unlinkRows, removeList } from './lists.js';
import { scheduleSave } from './save.js';
import { renderMonth } from './month.js';

// Resolves true on the confirming action, false on cancel, Esc or scrim click. cancel: null shows only OK.
export function askDialog({ title, text, ok = 'OK', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const d = $('#msgDlg');
    $('#msgTitle').textContent = title; $('#msgText').textContent = text;
    const okBtn = $('#msgOk'); okBtn.textContent = ok; okBtn.className = `btn ${danger ? 'danger' : 'primary'}`;
    $('#msgCancel').hidden = cancel === null; $('#msgCancel').textContent = cancel ?? '';
    d.returnValue = '';
    d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true });
    d.showModal();
  });
}
export const tellDialog = (title, text) => askDialog({ title, text, cancel: null });

let listEditing = null; // the list being edited in #listDlg, or null for a new one

// Open the list dialog for a list of this month (by key), or for a new list.
export function openListDialog(key) {
  const sec = key ? findSection(key) : null;
  listEditing = sec;
  $('#listDlgTitle').textContent = sec ? `Edit list (${monthLabel(state.tab)})` : 'New spending list for this month';
  const f = $('#listForm'); f.elements.title.value = sec?.title ?? ''; f.elements.group.value = sec?.group ?? 'needs';
  $('#listGroup').hidden = !!sec?.base; // Groceries and Transit are always Needs lists
  $('#listDlg').showModal(); f.elements.title.focus();
}

export async function deleteList(key) {
  const sec = findSection(key);
  if (!await askDialog({ title: `Delete “${sec.title}”?`, text: `The list and its rows will be removed from this month's spending. Rows linked to it become empty amounts.`, ok: 'Delete', danger: true })) return;
  removeList(curMonth(), sec);
  scheduleSave(); renderMonth();
}

function onListSubmit(e) {
  if (cancelled(e)) return;
  const f = e.target; const m = curMonth();
  const title = f.elements.title.value.trim().slice(0, 60); const group = f.elements.group.value;
  if (!title) return;
  if (sumLists().some((l) => l.key !== listEditing?.key && l.title.toLowerCase() === title.toLowerCase())) {
    e.preventDefault(); tellDialog('Name already used', `${monthLabel(state.tab)} already has a list named “${title}”. Choose a different name.`); return;
  }
  if (listEditing?.base) {
    (m.titles ||= {})[listEditing.key] = title;
  } else if (listEditing) {
    if (listEditing.group !== group) unlinkRows(m, listEditing.key); // rows in the old group can no longer link to it
    Object.assign(listEditing, { title, group });
  } else (m.sections ||= []).push({ key: `x${Date.now().toString(36)}`, title, group });
  scheduleSave(); renderMonth();
}

export function initDialogs() {
  $('#msgDlg').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(''); });
  $('#listForm').addEventListener('submit', onListSubmit);
}
