// Settings: savings goals (each adds a savings row to every month). Also the Customization dialog's optional Summary columns.
// Edits are kept in a draft and applied when the dialog is saved.
import { $, esc } from './dom.js';
import { icon } from './icons.js';
import { inputNum, toMoney } from './format.js';
import { SAV_COLS, goalCol } from './prefs.js';

let goals = []; let colGoals = []; let cols = new Set();

function renderGoals() {
  $('#goalsBox').innerHTML = goals.map((g, i) => `<div class="grid3" style="grid-template-columns:1fr 1fr auto;align-items:center;margin-top:12px">
    <label class="tf"><input type="text" maxlength="60" autocomplete="off" data-goal="${i}" data-k="name" value="${esc(g.name)}" placeholder=" "><span>Savings goal</span></label>
    <label class="tf"><input type="number" step="any" min="0" data-goal="${i}" data-k="target" value="${esc(g.target ?? '')}" placeholder=" "><span>Target $</span></label>
    <button type="button" class="btn ghost" data-rm-goal="${i}" aria-label="Remove savings goal" title="Remove">${icon("trash")}</button>
  </div>`).join('') + `<div style="margin-top:12px"><button type="button" class="btn" id="addGoalBtn">${icon('plus')}<span class="lbl">Add savings goal</span></button></div>`;
}

function renderCols() {
  const box = (key, label) => `<label class="check"><input type="checkbox" data-col="${esc(key)}" ${cols.has(key) ? 'checked' : ''}> ${esc(label)}</label>`;
  $('#savingsColsBox').innerHTML = SAV_COLS.map((k) => box(k, k)).join('') + colGoals.filter((g) => g.name.trim()).map((g) => box(goalCol(g.id), g.name.trim())).join('');
}

export function resetGoals(savedGoals) {
  goals = (savedGoals || []).map((g) => ({ ...g }));
  renderGoals();
}

// Customization lists the goals that are saved in the year.
export function resetCols(savedGoals, savedCols) {
  colGoals = savedGoals || []; cols = new Set(savedCols);
  renderCols();
}

// The goals to save (blank names dropped) and the chosen columns that still exist.
export function draftGoals() {
  return goals.map((g) => ({ id: g.id, name: g.name.trim(), target: Math.max(0, toMoney(g.target) ?? 0) })).filter((g) => g.name);
}
// Chosen columns that still exist (a goal's column goes when the goal is removed).
export const pruneCols = (list, saved) => list.filter((k) => SAV_COLS.includes(k) || saved.some((g) => goalCol(g.id) === k));
export const draftCols = () => pruneCols([...cols], colGoals);

export function initGoalsPanel() {
  const box = $('#goalsBox');
  box.addEventListener('input', (e) => {
    const t = e.target; const g = goals[t.dataset.goal]; if (!g) return;
    if (t.dataset.k === 'name') g.name = t.value; else g.target = inputNum(t);
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'addGoalBtn') {
      goals.push({ id: `g${Math.random().toString(36).slice(2, 8)}`, name: '', target: null });
      renderGoals(); box.querySelector(`input[data-goal="${goals.length - 1}"][data-k="name"]`).focus();
    } else if (b.dataset.rmGoal !== undefined) {
      goals.splice(Number(b.dataset.rmGoal), 1); renderGoals();
    }
  });
}

export function initColsPanel() {
  $('#savingsColsBox').addEventListener('change', (e) => { const c = e.target.dataset.col; if (!c) return; if (e.target.checked) cols.add(c); else cols.delete(c); });
}
