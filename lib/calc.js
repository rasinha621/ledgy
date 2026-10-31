// Calculation engine. Mirrors the formulas of the original spreadsheet.
// This file is used by the server (export) and by the browser (live view).

export const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
// Groceries and Transit are Needs lists that every month starts with. A month can rename or remove them.
export const BASE_LISTS = { groceries: 'Groceries', transit: 'Transit' };
export const baseLists = (month) => Object.entries(BASE_LISTS)
  .filter(([key]) => !month?.removed?.includes(key))
  .map(([key, title]) => ({ key, title: month?.titles?.[key] || title, group: 'needs' }));

export const SECTIONS = ['wants', 'needs', 'savings', 'groceries', 'transit'];

export const DEFAULT_SETTINGS = {
  wantsRate: 0.3,        // B1 = M1*0.3
  needsRate: 0.5,        // F1 = (M1*0.5)+200
  needsExtra: 200,
  savingsRate: 0.2,      // J1 = M1*0.2
  rothStart: 0,          // Summary F2 = <start> + SUM(I4)
  limit401k: 0,          // annual contribution limits; 0 = not set
  limitHsa: 0,
  limitRoth: 0,
};

const DEFAULT_NEEDS = [
  ['Rent'], ['Internet'], ['Renters'], ['Cell Phone'], ['Electricity'],
  ['Groceries', 'groceries'], ['Transit', 'transit'], ['Water'], ['Deductions'], ['Other'],
];
// The Summary reads these rows by position.
const DEFAULT_SAVINGS = ['401k', 'HSA', 'Roth', 'Cash', 'Investing'];

// Excel SUM ignores blanks and text.
export const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
// Excel gives #DIV/0! when the divisor is 0 or blank. We return null.
const div = (a, b) => (n(b) === 0 ? null : n(a) / n(b));
const sum = (rows) => rows.reduce((t, r) => t + n(r.amount), 0);

export function emptyMonth() {
  return {
    income: null,
    wants: [],
    needs: DEFAULT_NEEDS.map(([label, kind]) => ({ amount: null, label, kind: kind || 'manual' })),
    savings: DEFAULT_SAVINGS.map((label) => ({ amount: null, label })),
    groceries: [],
    transit: [],
    removed: [], // base lists taken off this month: 'groceries' | 'transit'
    titles: {},  // renamed base lists, by key
    sections: [], // user-added summation lists for this month: { key, title, group }, group = needs | wants | savings
    custom: {},   // their rows, by section key
  };
}

export function emptyYear(year) {
  return { year, settings: { ...DEFAULT_SETTINGS }, months: MONTHS.map(() => emptyMonth()) };
}

// Value of one row (Wants, Needs or Savings): its typed amount, or the total of the list it is linked to.
// Rows of a summation list: Groceries (Q/R), Transit (S/T) or a user-added list (month.sections).
export function listRows(month, key) {
  if (key === 'groceries') return month.groceries;
  if (key === 'transit') return month.transit;
  return month.custom?.[key] || [];
}
export const sumRows = (rows) => sum(rows);

export function needsRowValue(row, month) {
  if (row.kind && row.kind !== 'manual') return sum(listRows(month, row.kind)); // =SUM(Q:Q), =SUM(S:S), ...
  return n(row.amount);
}

export function calcMonth(month, settings = DEFAULT_SETTINGS) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const M1 = n(month.income);
  const B1 = M1 * s.wantsRate;
  const C1 = month.wants.reduce((t, r) => t + needsRowValue(r, month), 0);
  const F1 = M1 * s.needsRate + s.needsExtra;
  const G1 = month.needs.reduce((t, r) => t + needsRowValue(r, month), 0);
  const J1 = M1 * s.savingsRate;
  const K1 = month.savings.reduce((t, r) => t + needsRowValue(r, month), 0);
  const M2 = C1 + G1 + K1;
  return {
    income: M1, hasIncome: typeof month.income === 'number',
    wantsBudget: B1, wantsTotal: C1, wantsPct: div(C1, B1),
    needsBudget: F1, needsTotal: G1, needsPct: div(G1, F1),
    savingsBudget: J1, savingsTotal: K1, savingsPct: div(K1, J1),
    allocated: M2, allocatedPct: div(M2, M1), remaining: M1 - M2,
    groceriesTotal: sum(month.groceries), transitTotal: sum(month.transit),
  };
}

// Savings rows are read by position, as in the Summary sheet (I2..I5).
const sav = (month, i) => (month.savings[i] ? needsRowValue(month.savings[i], month) : 0);

export function calcSummary(doc) {
  const s = { ...DEFAULT_SETTINGS, ...doc.settings };
  const calcs = doc.months.map((m) => calcMonth(m, s));
  const total = (f) => calcs.reduce((t, c) => t + f(c), 0);
  const cash = doc.months.reduce((t, m) => t + sav(m, 3), 0);
  const investing = doc.months.reduce((t, m) => t + sav(m, 4), 0);
  const retirement = total((c) => c.savingsTotal) - cash - investing;
  return {
    totalIncome: total((c) => c.income),
    totalWants: total((c) => c.wantsTotal),                      // B2
    totalNeeds: total((c) => c.needsTotal),                      // C2
    totalSavings: total((c) => c.savingsTotal),                  // all savings rows, cash and investing included
    retirementHsa: retirement,                                   // savings other than cash and investing
    cashSavings: cash,                                           // E2
    investingSavings: investing,                                 // F2
    roth: s.rothStart + doc.months.reduce((t, m) => t + sav(m, 2), 0), // F2
    hsa: doc.months.reduce((t, m) => t + sav(m, 1), 0),           // G2
    k401: doc.months.reduce((t, m) => t + sav(m, 0), 0),          // H2
    months: calcs,
  };
}

// Make sure a document from the client or a file has the right shape.
export function normalizeYear(doc, year) {
  const out = emptyYear(year);
  out.settings = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    const v = doc?.settings?.[k];
    if (typeof v === typeof DEFAULT_SETTINGS[k] && (typeof v !== 'number' || Number.isFinite(v))) out.settings[k] = v;
  }
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const str = (v) => (typeof v === 'string' ? v.slice(0, 500) : '');
  out.months = MONTHS.map((_, i) => {
    const m = doc?.months?.[i];
    if (!m) return emptyMonth();
    // Lists belong to one month. Older data kept them on the year, so those are copied to every month.
    const taken = new Set(['groceries', 'transit', 'manual']);
    const sections = (Array.isArray(m.sections) ? m.sections : (Array.isArray(doc.sections) ? doc.sections : [])).slice(0, 20).filter((s) => {
      const ok = typeof s?.key === 'string' && /^[a-z0-9]{1,16}$/.test(s.key) && !taken.has(s.key) && typeof s.title === 'string' && s.title.trim();
      if (ok) taken.add(s.key);
      return ok;
    }).map((s) => ({ key: s.key, title: s.title.trim().slice(0, 60), group: ['wants', 'needs', 'savings'].includes(s.group) ? s.group : 'needs' }));
    // A row can only link to a list of its own group (Groceries and Transit are Needs lists).
    const removed = (Array.isArray(m.removed) ? m.removed : []).filter((k) => k in BASE_LISTS);
    const titles = Object.fromEntries(Object.keys(BASE_LISTS).filter((k) => typeof m.titles?.[k] === 'string' && m.titles[k].trim()).map((k) => [k, m.titles[k].trim().slice(0, 60)]));
    const keysFor = (g) => new Set([...(g === 'needs' ? Object.keys(BASE_LISTS).filter((k) => !removed.includes(k)) : []), ...sections.filter((s) => s.group === g).map((s) => s.key)]);
    // Older data had one bank row (position 4). Rename it to Cash and add the Investing row after it.
    const SAVINGS_LABELS = ['401k', 'HSA', 'Roth', 'Cash', 'Investing'];
    const savingsRows = (list) => {
      if (list.length === 4 && /^(savings|bank.*)?$/i.test(list[3].label.trim())) list[3].label = 'Cash';
      while (list.length < SAVINGS_LABELS.length) list.push({ amount: null, label: SAVINGS_LABELS[list.length], kind: 'manual' });
      return list;
    };
    const rows = (a, group) => (Array.isArray(a) ? a.slice(0, 2000) : []).map((r) => {
      const row = { amount: num(r?.amount), label: str(r?.label) };
      if (group) row.kind = keysFor(group).has(r?.kind) ? r.kind : 'manual';
      return row;
    });
    return {
      income: num(m.income),
      wants: rows(m.wants, 'wants'), needs: rows(m.needs, 'needs'), savings: savingsRows(rows(m.savings, 'savings')),
      groceries: removed.includes('groceries') ? [] : rows(m.groceries), transit: removed.includes('transit') ? [] : rows(m.transit),
      removed, titles,
      sections,
      custom: Object.fromEntries(sections.map((s) => [s.key, rows(m.custom?.[s.key])])),
    };
  });
  return out;
}
