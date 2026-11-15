// Picker under a Wants / Needs / Savings amount: link the row to a list's total (or just type a number).
import { isLinked, listRows, sumRows } from '/lib/calc.js';
import { esc } from './dom.js';
import { fmt } from './format.js';
import { curMonth } from './state.js';
import { sumLists, listInfo, findList, listQuery } from './lists.js';
import { scheduleSave } from './save.js';
import { rowCtx, refresh } from './month.js';

const pop = Object.assign(document.createElement('div'), { id: 'sumPop', hidden: true });
document.body.append(pop);
let popFor = null; let popHi = -1;

// Link a row to a list (or unlink it with key null). The amount input shows the change right away.
export function setLink(t, row, key) {
  row.kind = key ?? 'manual'; row.amount = null;
  t.classList.toggle('linked', Boolean(key)); t.style.color = '';
  scheduleSave(); refresh();
}

function popItems(t) {
  const { sec } = rowCtx(t); const q = listQuery(t.value);
  return !q || /^[-+=$.\d]/.test(q) || findList(q, sec) ? sumLists(sec) : sumLists(sec).filter((l) => l.title.toLowerCase().includes(q));
}

export function showPop(t) {
  const items = popItems(t);
  popFor = t; popHi = -1;
  if (!items.length) { pop.hidden = true; return; }
  const m = curMonth(); const { row } = rowCtx(t); const cur = row.kind;
  pop.innerHTML = '<div class="pop-h">Total of a list</div>'
    + items.map((l) => `<button type="button" data-key="${l.key}" class="${l.key === cur ? 'cur' : ''}"><span>Σ ${esc(l.title)}</span><span>${fmt(sumRows(listRows(m, l.key)))}</span></button>`).join('')
    + (isLinked(row) ? '<button type="button" data-key="__unlink"><span>Unlink</span></button>' : '');
  const r = t.getBoundingClientRect();
  pop.style.left = `${r.left}px`; pop.style.top = `${r.bottom + 2}px`; pop.style.minWidth = `${Math.max(r.width, 200)}px`;
  pop.hidden = false;
}

export function hidePop() { pop.hidden = true; popFor = null; popHi = -1; }

function pickList(key) {
  const t = popFor; if (!t) return;
  const { row } = rowCtx(t);
  hidePop();
  if (key === '__unlink') { t.value = ''; setLink(t, row, null); return; }
  t.value = listInfo(key).title; t.select();
  setLink(t, row, key);
}

// Arrow keys, Enter and Escape while the picker is open for t. Returns true when the key was handled.
export function popKeydown(e, t) {
  if (pop.hidden || popFor !== t) return false;
  const btns = [...pop.querySelectorAll('button')];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); popHi = (popHi + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length;
    btns.forEach((b, k) => b.classList.toggle('hi', k === popHi)); return true;
  }
  if (e.key === 'Enter' && popHi >= 0) { e.preventDefault(); pickList(btns[popHi].dataset.key); return true; }
  if (e.key === 'Escape') { hidePop(); return true; }
  return false;
}

export function initPicker() {
  pop.addEventListener('mousedown', (e) => { // keep focus in the input
    e.preventDefault();
    const b = e.target.closest('button[data-key]'); if (b) pickList(b.dataset.key);
  });
  window.addEventListener('scroll', hidePop, true);
}
