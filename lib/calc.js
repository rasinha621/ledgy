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
  needsRate: 0.5,        // F1 = M1*0.5
  payPeriod: 'monthly', // monthly | bimonthly: how many pay rows each month has on the Income tab
  savingsRate: 0.2,      // J1 = M1*0.2
  rothStart: 0,          // Summary F2 = <start> + SUM(I4)
  savingsDrawdown: false, // when a month runs over income, draw the shortfall from the year's cash savings
  limit401k: 0,          // annual contribution limits; 0 = not set
  limitHsa: 0,
  limitRoth: 0,
  goals: [],             // savings goals: { id, name, target }. Each adds a savings row to every month.
};

const DEFAULT_NEEDS = [
  ['Rent'], ['Internet'], ['Renters'], ['Cell Phone'], ['Electricity'],
  ['Groceries', 'groceries'], ['Transit', 'transit'], ['Water'], ['Deductions'], ['Other'],
];
// The Summary reads these rows by position.
const DEFAULT_SAVINGS = ['401k', 'HSA', 'Roth', 'Cash', 'Investing'];

// Money is kept to two decimal places everywhere.
export const round2 = (v) => Math.sign(v) * Math.round(Number((Math.abs(v) * 100).toPrecision(15))) / 100 || 0;
// Excel SUM ignores blanks and text.
export const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
// Excel gives #DIV/0! when the divisor is 0 or blank. We return null.
const div = (a, b) => (n(b) === 0 ? null : n(a) / n(b));
const sum = (rows) => round2(rows.reduce((t, r) => t + n(r.amount), 0));

export function emptyMonth() {
  return {
    income: null,
    pay: [{ gross: null, taxes: null }, { gross: null, taxes: null }], // pay periods; only the first one counts when monthly
    extras: [], // ad hoc income for this month: { label, amount }
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
  const B1 = round2(M1 * s.wantsRate);
  const C1 = round2(month.wants.reduce((t, r) => t + needsRowValue(r, month), 0));
  const F1 = round2(M1 * s.needsRate);
  const G1 = round2(month.needs.reduce((t, r) => t + needsRowValue(r, month), 0));
  const J1 = round2(M1 * s.savingsRate);
  const K1 = round2(month.savings.reduce((t, r) => t + needsRowValue(r, month), 0));
  const M2 = round2(C1 + G1 + K1);
  // Gross income and taxes come from the Income tab's paychecks (only as many as the pay period uses) plus extra income.
  // Without any of those entered, income is taken as typed, with no taxes.
  const pays = (month.pay || []).slice(0, s.payPeriod === 'bimonthly' ? 2 : 1);
  const extras = (month.extras || []).reduce((t, x) => t + n(x.amount), 0);
  const entered = pays.some((p) => p.gross !== null || p.taxes !== null) || (month.extras || []).some((x) => x.amount !== null);
  const taxes = entered ? round2(pays.reduce((t, p) => t + n(p.taxes), 0)) : 0;
  const gross = entered ? round2(pays.reduce((t, p) => t + n(p.gross), 0) + extras) : M1;
  return {
    income: M1, gross, taxes, hasIncome: typeof month.income === 'number',
    wantsBudget: B1, wantsTotal: C1, wantsPct: div(C1, B1),
    needsBudget: F1, needsTotal: G1, needsPct: div(G1, F1),
    savingsBudget: J1, savingsTotal: K1, savingsPct: div(K1, J1),
    allocated: M2, allocatedPct: div(M2, M1), remaining: round2(M1 - M2),
    groceriesTotal: sum(month.groceries), transitTotal: sum(month.transit),
  };
}

// Savings rows are read by position, as in the Summary sheet (I2..I5).
const sav = (month, i) => (month.savings[i] ? needsRowValue(month.savings[i], month) : 0);

export function calcSummary(doc) {
  const s = { ...DEFAULT_SETTINGS, ...doc.settings };
  const calcs = doc.months.map((m) => calcMonth(m, s));
  const total = (f) => round2(calcs.reduce((t, c) => t + f(c), 0));
  const months = (f) => round2(doc.months.reduce((t, m) => t + f(m), 0));
  const cash = months((m) => sav(m, 3));
  const investing = months((m) => sav(m, 4));
  const retirement = round2(total((c) => c.savingsTotal) - cash - investing);
  return {
    totalIncome: total((c) => c.income),
    totalWants: total((c) => c.wantsTotal),                      // B2
    totalNeeds: total((c) => c.needsTotal),                      // C2
    totalSavings: total((c) => c.savingsTotal),                  // all savings rows, cash and investing included
    retirementHsa: retirement,                                   // savings other than cash and investing
    cashSavings: cash,                                           // E2
    cashBalance: s.savingsDrawdown ? round2(cash - total((c) => (c.hasIncome && c.remaining < -0.005 ? -c.remaining : 0))) : cash, // cash left after months over income are drawn from it
    investingSavings: investing,                                 // F2
    roth: round2(s.rothStart + months((m) => sav(m, 2))), // F2
    hsa: months((m) => sav(m, 1)),           // G2
    k401: months((m) => sav(m, 0)),          // H2
    goals: (s.goals || []).map((g) => ({ ...g, total: months((m) => m.savings.filter((r) => r.goal === g.id).reduce((t, r) => t + needsRowValue(r, m), 0)) })),
    months: calcs,
  };
}

// Give every month a savings row for each goal (named after it). Rows of a goal that was removed become plain rows.
export function syncGoals(doc) {
  const goals = doc.settings.goals || [];
  const ids = new Set(goals.map((g) => g.id));
  for (const m of doc.months) {
    for (const r of m.savings) if (r.goal && !ids.has(r.goal)) delete r.goal;
    for (const g of goals) {
      const row = m.savings.find((r) => r.goal === g.id);
      if (row) row.label = g.name; else m.savings.push({ amount: null, label: g.name, kind: 'manual', goal: g.id });
    }
  }
}

// With drawdown on, a month over income is covered while the cash saved so far this year (minus earlier shortfalls) stays at or above zero.
export function calcDrawdown(doc) {
  const s = { ...DEFAULT_SETTINGS, ...doc.settings };
  let balance = 0;
  return doc.months.map((m) => {
    const c = calcMonth(m, s);
    const over = c.hasIncome && c.remaining < -0.005;
    balance = round2(balance + sav(m, 3) - (over ? -c.remaining : 0));
    return { over, balance, covered: s.savingsDrawdown && over && balance >= -0.005 };
  });
}

// Make sure a document from the client or a file has the right shape.
export function normalizeYear(doc, year) {
  const out = emptyYear(year);
  out.settings = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS).filter((key) => key !== 'goals')) {
    const v = doc?.settings?.[k];
    if (typeof v === typeof DEFAULT_SETTINGS[k] && (typeof v !== 'number' || Number.isFinite(v))) out.settings[k] = v;
  }
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? round2(v) : null);
  const seenGoals = new Set();
  out.settings.goals = (Array.isArray(doc?.settings?.goals) ? doc.settings.goals : []).slice(0, 20).filter((g) => {
    const ok = typeof g?.id === 'string' && /^[a-z0-9]{1,16}$/.test(g.id) && !seenGoals.has(g.id) && typeof g.name === 'string' && g.name.trim();
    if (ok) seenGoals.add(g.id);
    return ok;
  }).map((g) => ({ id: g.id, name: g.name.trim().slice(0, 60), target: Math.max(0, num(g.target) || 0) }));
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
      if (group === 'savings' && seenGoals.has(r?.goal)) row.goal = r.goal;
      return row;
    });
    return {
      income: num(m.income),
      pay: [0, 1].map((p) => {
        const src = Array.isArray(m.pay) ? m.pay[p] : (p === 0 ? m : null); // older data kept one gross/taxes pair on the month
        return { gross: num(src?.gross), taxes: num(src?.taxes) };
      }),
      extras: (Array.isArray(m.extras) ? m.extras : []).slice(0, 20).map((x) => ({ label: str(x?.label).slice(0, 60), amount: num(x?.amount) })),
      wants: rows(m.wants, 'wants'), needs: rows(m.needs, 'needs'), savings: savingsRows(rows(m.savings, 'savings')),
      groceries: removed.includes('groceries') ? [] : rows(m.groceries), transit: removed.includes('transit') ? [] : rows(m.transit),
      removed, titles,
      sections,
      custom: Object.fromEntries(sections.map((s) => [s.key, rows(m.custom?.[s.key])])),
    };
  });
  return out;
}
