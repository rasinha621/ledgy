// Imports the original xlsx and compares every computed cell to the values cached in the file.
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { importWorkbook, exportWorkbook } from '../lib/xlsx-io.js';
import { calcMonth, calcSummary, MONTHS } from '../lib/calc.js';

const file = process.argv[2];
const buf = readFileSync(file);
const { doc, warnings } = await importWorkbook(buf, 2026);
const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
const cached = (ws, a) => { const v = ws.getCell(a).value; return v && typeof v === 'object' ? (v.error ? null : v.result) : v; };
let bad = 0, checked = 0;
const cmp = (where, got, want) => {
  checked++;
  const w = typeof want === 'number' ? want : null; // blank or #DIV/0!
  const g = got;
  const ok = (w === null && (g === null || Math.abs(g) < 1e-6)) || (typeof w === 'number' && typeof g === 'number' && Math.abs(g - w) < 1e-6);
  if (!ok) { bad++; console.log('MISMATCH', where, 'got', g, 'want', w); }
};
const map = { B1: 'wantsBudget', C1: 'wantsTotal', C2: 'wantsPct', F1: 'needsBudget', G1: 'needsTotal', G2: 'needsPct',
  J1: 'savingsBudget', K1: 'savingsTotal', K2: 'savingsPct', M2: 'allocated', M3: 'allocatedPct', N3: 'remaining' };
const check = async (book, d, label) => {
  MONTHS.forEach((m, i) => {
    const ws = book.getWorksheet(m); const c = calcMonth(d.months[i], d.settings);
    for (const [a, k] of Object.entries(map)) cmp(`${label} ${m}!${a}`, c[k], cached(ws, a));
    cmp(`${label} ${m}!E7`, c.groceriesTotal, cached(ws, 'E7'));
  });
  const s = calcSummary(d); const ws = book.getWorksheet('Summary');
  ['totalIncome','totalWants','totalNeeds','retirementHsa','bankSavings','roth','hsa','k401'].forEach((k, i) =>
    cmp(`${label} Summary!${String.fromCharCode(65 + i)}2`, s[k], cached(ws, `${String.fromCharCode(65 + i)}2`)));
};
await check(wb, doc, 'import');
// Round trip: export, import again, compare to the original cached values.
const out = await exportWorkbook(doc);
const again = await importWorkbook(Buffer.from(out), 2026);
await check(wb, again.doc, 'roundtrip');
console.log('settings', doc.settings);
console.log('warnings', warnings);
console.log(`${checked} checks, ${bad} mismatches`);
process.exit(bad ? 1 : 0);
