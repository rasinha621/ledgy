// The categories (cards) of a month: Wants, Needs and Savings, plus summation lists (Groceries, Transit and
// lists the user adds). A row of a budget group can be linked to a list of the same group to show its total.
import { GROUPS, SECTIONS, baseLists, isLinked } from '/lib/calc.js';
import { curMonth } from './state.js';

export const SEC = {
  wants: { title: 'Wants', color: '--wants', ph: 'Note' },
  needs: { title: 'Needs', color: '--needs', ph: 'Label' },
  savings: { title: 'Savings', color: '--savings', ph: 'Label' },
  groceries: { title: 'Groceries', color: '--needs', ph: 'Note' },
  transit: { title: 'Transit', color: '--needs', ph: 'Note' },
};

// Wants, Needs and Savings: budgeted, and their rows can total a list.
export const isGroup = (sec) => GROUPS.includes(sec);

// All lists of a month, optionally only those of one group. Groceries and Transit are Needs lists.
export const sumLists = (group, m = curMonth()) => [
  ...baseLists(m),
  ...(m?.sections || []).map((s) => ({ ...s, group: s.group || 'needs' })),
].filter((l) => !group || l.group === group);
export const listInfo = (key) => sumLists().find((l) => l.key === key);

// The list a typed name refers to ("Groceries" or "Σ Groceries"), if any.
export const listQuery = (text) => String(text).trim().replace(/^Σ\s*/, '').toLowerCase();
export const findList = (text, group) => {
  const q = listQuery(text);
  return q ? sumLists(group).find((l) => l.title.toLowerCase() === q) : undefined;
};

// The list a linked row shows the total of, or null.
export const linkedList = (sec, row) => (isGroup(sec) && isLinked(row) ? listInfo(row.kind) : null);

export const secMeta = (sec) => {
  const info = listInfo(sec);
  return SEC[sec] ? { ...SEC[sec], title: info?.title ?? SEC[sec].title } : { title: info?.title ?? sec, color: `--${info?.group ?? 'needs'}`, ph: 'Note' };
};
export const rowsOf = (month, sec) => (SECTIONS.includes(sec) ? month[sec] : ((month.custom ||= {})[sec] ||= []));
export const newRow = (sec) => (isGroup(sec) ? { amount: null, label: '', kind: 'manual' } : { amount: null, label: '' });

// The list to rename or delete: a section of this month, or Groceries / Transit (marked base, edited through month.titles).
export const findSection = (key) => {
  const m = curMonth();
  return m.sections.find((s) => s.key === key) || (baseLists(m).some((l) => l.key === key) ? { key, title: listInfo(key).title, group: 'needs', base: true } : null);
};

// Rows linked to a list that is going away (or moving group) become empty amounts.
export function unlinkRows(m, key) {
  for (const g of GROUPS) for (const r of m[g]) if (r.kind === key) { r.kind = 'manual'; r.amount = null; }
}

export function removeList(m, sec) {
  if (sec.base) { (m.removed ||= []).push(sec.key); m[sec.key] = []; delete m.titles?.[sec.key]; } else {
    m.sections = m.sections.filter((s) => s !== sec);
    delete m.custom?.[sec.key];
  }
  unlinkRows(m, sec.key);
}
