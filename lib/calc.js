// Calculation engine. Mirrors the formulas of the original spreadsheet.
// This file is used by the server (export) and by the browser (live view).

export const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export const SECTIONS = ['wants', 'needs', 'savings', 'groceries', 'transit'];

export const DEFAULT_SETTINGS = {
  wantsRate: 0.3,        // B1 = M1*0.3
  needsRate: 0.5,        // F1 = (M1*0.5)+200
  needsExtra: 200,
  savingsRate: 0.2,      // J1 = M1*0.2
  rothStart: 0,          // Summary F2 = <start> + SUM(I4)
  hsa401kIncludeDec: false,       // Summary G2/H2 add JAN..NOV only
  retirementIncludesBank: true,   // Summary D2 = SUM(K1), which includes I5
  limit401k: 0,          // annual contribution limits; 0 = not set
  limitHsa: 0,
  limitRoth: 0,
};

const DEFAULT_NEEDS = [
  ['Rent'], ['Internet'], ['Renters'], ['Cell Phone'], ['Electricity'],
  ['Groceries', 'groceries'], ['Transit', 'transit'], ['Water'], ['Deductions'], ['Other'],
];
const DEFAULT_SAVINGS = ['401k', 'HSA', 'Roth', 'Savings'];

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
    custom: {}, // rows of user-added summation lists, by section key
  };
}

export function emptyYear(year) {
  return { year, settings: { ...DEFAULT_SETTINGS }, sections: [], months: MONTHS.map(() => emptyMonth()) };
}

// Value of one Needs row (column E).
// Rows of a summation list: Groceries (Q/R), Transit (S/T) or a user-added list (year.sections).
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
  const C1 = sum(month.wants);
  const F1 = M1 * s.needsRate + s.needsExtra;
  const G1 = month.needs.reduce((t, r) => t + needsRowValue(r, month), 0);
  const J1 = M1 * s.savingsRate;
  const K1 = sum(month.savings);
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
const sav = (month, i) => n(month.savings[i]?.amount);

export function calcSummary(doc) {
  const s = { ...DEFAULT_SETTINGS, ...doc.settings };
  const calcs = doc.months.map((m) => calcMonth(m, s));
  const hsaMonths = s.hsa401kIncludeDec ? doc.months : doc.months.slice(0, 11);
  const total = (f) => calcs.reduce((t, c) => t + f(c), 0);
  const bank = doc.months.reduce((t, m) => t + sav(m, 3), 0);
  const retirement = total((c) => c.savingsTotal) - (s.retirementIncludesBank ? 0 : bank);
  return {
    totalIncome: total((c) => c.income),
    totalWants: total((c) => c.wantsTotal),                      // B2
    totalNeeds: total((c) => c.needsTotal),                      // C2
    retirementHsa: retirement,                                   // D2
    bankSavings: bank,                                           // E2
    roth: s.rothStart + doc.months.reduce((t, m) => t + sav(m, 2), 0), // F2
    hsa: hsaMonths.reduce((t, m) => t + sav(m, 1), 0),           // G2
    k401: hsaMonths.reduce((t, m) => t + sav(m, 0), 0),          // H2
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
  const taken = new Set(['groceries', 'transit', 'manual']);
  out.sections = (Array.isArray(doc?.sections) ? doc.sections : []).slice(0, 20).filter((s) => {
    const ok = typeof s?.key === 'string' && /^[a-z0-9]{1,16}$/.test(s.key) && !taken.has(s.key) && typeof s.title === 'string' && s.title.trim();
    if (ok) taken.add(s.key);
    return ok;
  }).map((s) => ({ key: s.key, title: s.title.trim().slice(0, 60) }));
  const listKeys = new Set(['groceries', 'transit', ...out.sections.map((s) => s.key)]);
  out.months = MONTHS.map((_, i) => {
    const m = doc?.months?.[i];
    if (!m) return emptyMonth();
    const rows = (a, withKind) => (Array.isArray(a) ? a.slice(0, 2000) : []).map((r) => {
      const row = { amount: num(r?.amount), label: str(r?.label) };
      if (withKind) row.kind = listKeys.has(r?.kind) ? r.kind : 'manual';
      return row;
    });
    return {
      income: num(m.income),
      wants: rows(m.wants), needs: rows(m.needs, true), savings: rows(m.savings),
      groceries: rows(m.groceries), transit: rows(m.transit),
      custom: Object.fromEntries(out.sections.map((s) => [s.key, rows(m.custom?.[s.key])])),
    };
  });
  return out;
}
