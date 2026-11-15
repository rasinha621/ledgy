// Regenerates test/fixture.xlsx: a sample year that uses the app's current features.
// Run with: node test/make-fixture.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { exportWorkbook } from '../lib/xlsx-io.js';
import { emptyYear, normalizeYear } from '../lib/calc.js';

const doc = emptyYear(2026);
// Custom budget rates and a Roth balance carried in from earlier years.
Object.assign(doc.settings, { wantsRate: 0.25, needsRate: 0.55, savingsRate: 0.2, rothStart: 1500 });
const rows = (...a) => a.map(([label, amount]) => ({ label, amount }));

doc.months.forEach((m, i) => {
  if (i === 5) return; // JUN left empty: no income, so the percentages are #DIV/0!
  m.income = 5000 + i * 125.5;
  m.wants = [
    { label: 'Dining out', amount: 180.25 + i, kind: 'manual' },
    { label: 'Streaming', amount: 22.99, kind: 'manual' },
    { label: 'Hobbies', amount: null, kind: 'manual' },
  ];
  m.needs.forEach((r, k) => { if (r.kind === 'manual') r.amount = [1800, 70, 15, 60, 95, 0, 0, 45, 300, 40][k] ?? 0; });
  m.groceries = rows(['Trader Joes', 120.4 + i], ['Costco', 210], ['Farmers market', 35.15]);
  m.transit = rows(['Metro pass', 100], ['Rideshare', 24.5 + i]);
  // Savings by position: 401k, HSA, Roth, Cash, Investing.
  [500, 150, 291.67, 400 + i * 10, 250].forEach((v, k) => { m.savings[k].amount = v; });
  // A user-added list linked to a row in each of the Wants and Needs groups.
  m.sections = [{ key: 'x1', title: 'Pets', group: 'needs' }, { key: 'x2', title: 'Gifts', group: 'wants' }];
  m.custom = { x1: rows(['Vet', 80 + i], ['Food', 45.5]), x2: rows(['Birthday', 60], ['Holiday', i === 11 ? 250 : 0]) };
  m.needs.push({ label: 'Pets', amount: null, kind: 'x1' });
  m.wants.push({ label: 'Gifts', amount: null, kind: 'x2' });
});
// FEB: Transit list renamed and Groceries list removed from the month.
doc.months[1].titles = { transit: 'Commute' };
doc.months[1].removed = ['groceries'];
doc.months[1].groceries = [];
doc.months[1].needs.forEach((r) => { if (r.kind === 'groceries') r.kind = 'manual'; });
// MAR: spending above income, a text note in an amount cell is not part of this fixture.
doc.months[2].needs[0].amount = 6500;

const out = fileURLToPath(new URL('./fixture.xlsx', import.meta.url));
writeFileSync(out, Buffer.from(await exportWorkbook(normalizeYear(doc, 2026))));
console.log('wrote', out);
