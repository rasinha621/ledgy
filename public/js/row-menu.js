// The ▾ menu at the end of each row: mark a Wants / Needs spend as paid from a savings goal, or delete the row.
// A spend paid from a goal still counts as spending, and comes off the goal's balance.
import { goalBalances } from '/lib/calc.js';
import { $, esc } from './dom.js';
import { icon } from './icons.js';
import { fmt } from './format.js';
import { state, curMonth } from './state.js';
import { rowsOf } from './lists.js';
import { scheduleSave } from './save.js';
import { renderMonth, refresh, focusRow, markGoal } from './month.js';

const menu = Object.assign(document.createElement('div'), { id: 'rowMenu', role: 'menu', hidden: true });
document.body.append(menu);
let menuFor = null; // the ▾ button the menu is open for

const canFund = (sec) => sec === 'wants' || sec === 'needs';
const ctxOf = (btn) => {
  const sec = btn.closest('[data-sec]').dataset.sec; const i = Number(btn.dataset.i);
  return { sec, i, rows: rowsOf(curMonth(), sec), row: rowsOf(curMonth(), sec)[i] };
};

export function closeRowMenu(refocus = false) {
  if (!menuFor) return;
  const btn = menuFor; menuFor = null; menu.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
  if (refocus && btn.isConnected) btn.focus();
}

function openRowMenu(btn) {
  const { sec, row } = ctxOf(btn);
  const goals = canFund(sec) ? goalBalances(state.doc) : [];
  const item = (attrs, label, extra = '', cls = '') => `<button type="button" role="menuitem" ${attrs} class="${cls}"><span>${label}</span>${extra}</button>`;
  menu.innerHTML = (goals.length ? '<div class="pop-h">Paid from a goal</div>' : '')
    + goals.map((g) => item(`data-goal="${g.id}"`, esc(g.name), `<span>${fmt(g.total)} left</span>`, g.id === row.goal ? 'cur' : '')).join('')
    + (row.goal ? item('data-goal="__none"', 'Not from a goal') : '')
    + (goals.length ? '<hr>' : '')
    + item('data-act="delete"', `${icon('trash')}Delete row`, '', 'danger');
  const r = btn.getBoundingClientRect();
  menu.hidden = false;
  menu.style.top = `${r.bottom + 2}px`;
  menu.style.left = `${Math.max(8, r.right - menu.offsetWidth)}px`;
  menuFor = btn; btn.setAttribute('aria-expanded', 'true');
  (menu.querySelector('.cur') || menu.querySelector('button')).focus();
}

export function toggleRowMenu(btn) {
  const same = menuFor === btn;
  closeRowMenu();
  if (!same) openRowMenu(btn);
}

function choose(b) {
  const btn = menuFor; if (!btn) return;
  const { sec, i, rows, row } = ctxOf(btn);
  if (b.dataset.act === 'delete') {
    closeRowMenu();
    rows.splice(i, 1); scheduleSave(); renderMonth();
    focusRow(sec, Math.min(i, rows.length - 1));
    return;
  }
  if (b.dataset.goal === '__none') delete row.goal; else row.goal = b.dataset.goal;
  closeRowMenu(true);
  markGoal(btn, row); scheduleSave(); refresh();
}

export function initRowMenu() {
  menu.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) choose(b); });
  menu.addEventListener('keydown', (e) => {
    const btns = [...menu.querySelectorAll('button')]; const k = btns.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); btns[(k + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length].focus(); }
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closeRowMenu(true); }
  });
  // Click elsewhere, scroll, or a re-render that removes the button: close.
  document.addEventListener('pointerdown', (e) => { if (menuFor && !menu.contains(e.target) && !menuFor.contains(e.target)) closeRowMenu(); });
  window.addEventListener('scroll', (e) => { if (!menu.contains(e.target)) closeRowMenu(); }, true);
  window.addEventListener('resize', () => closeRowMenu());
}
