// Dialogs that bring in a year: import a spreadsheet or backup, or start a new year (blank or copied from one).
import { $, esc, cancelled } from './dom.js';
import { api } from './api.js';
import { state } from './state.js';
import { flush } from './save.js';
import { loadYears } from './render.js';
import { askDialog, tellDialog } from './dialogs.js';

export function openImport() {
  $('#importMsg').innerHTML = '';
  $('#importYear').value = state.doc?.year ?? new Date().getFullYear();
  $('#importFile').value = '';
  $('#importGo').disabled = false;
  $('#importDlg').showModal();
}

async function onImportSubmit(e) {
  if (cancelled(e)) return;
  e.preventDefault();
  const file = $('#importFile').files[0]; const y = Number($('#importYear').value);
  if (!file || !y) return;
  const msg = $('#importMsg'); const go = $('#importGo');
  msg.textContent = 'Importing…'; go.disabled = true;
  const send = (overwrite) => api(`/api/years/${y}/import${overwrite ? '?overwrite=1' : ''}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
  try {
    await flush();
    let body;
    try { body = await send(false); } catch (err) {
      if (err.status !== 409) throw err;
      if (!await askDialog({ title: `Replace ${y}?`, text: `${y} already has data. Importing this file replaces it.`, ok: 'Replace', danger: true })) { msg.textContent = 'Import cancelled.'; go.disabled = false; return; }
      body = await send(true);
    }
    msg.innerHTML = `<strong>Imported ${y}.</strong>${body.warnings.length ? `<ul>${body.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`;
    await loadYears(y);
  } catch (err) {
    msg.innerHTML = `<span class="err">${esc(err.message)}</span>`;
  }
  go.disabled = false;
}

export function openNew() {
  const { years } = state;
  const max = years.length ? Math.max(...years.map((y) => y.year)) : new Date().getFullYear() - 1;
  $('#newYear').value = max + 1;
  $('#newFrom').innerHTML = '<option value="">Blank template</option>' + years.map((y) => `<option value="${y.year}" ${y.year === max ? 'selected' : ''}>Copy layout from ${y.year}</option>`).join('');
  $('#newDlg').showModal();
}

async function onNewSubmit(e) {
  if (cancelled(e)) return;
  const y = Number($('#newYear').value); const from = $('#newFrom').value;
  try {
    await flush();
    await api(`/api/years/${y}`, { method: 'POST', body: JSON.stringify({ from: from ? Number(from) : null }) });
    await loadYears(y);
  } catch (err) {
    if (err.status === 409) tellDialog(`${y} already exists`, 'Pick a different year, or select it from the year menu.');
    else tellDialog('Could not create the year', err.message);
  }
}

export function initYearDialogs() {
  // A JSON backup knows its year; fill it in.
  $('#importFile').addEventListener('change', async () => {
    const file = $('#importFile').files[0];
    if (!file || !/\.json$/i.test(file.name)) return;
    try { const y = JSON.parse(await file.text()).year; if (Number.isInteger(y)) $('#importYear').value = y; } catch { /* the server reports bad files */ }
  });
  $('#importBtn').addEventListener('click', () => { $('#settingsDlg').close(); openImport(); });
  $('#importForm').addEventListener('submit', onImportSubmit);
  $('#newYearBtn').addEventListener('click', openNew);
  $('#newForm').addEventListener('submit', onNewSubmit);
}
