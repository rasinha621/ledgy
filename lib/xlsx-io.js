// Import from and export to the original spreadsheet layout.
import ExcelJS from 'exceljs';
import { MONTHS, DEFAULT_SETTINGS, emptyYear, calcMonth, calcSummary, needsRowValue, listRows } from './calc.js';

const MONEY = '#,##0.00';
const PCT = '0.00%';
const USD = '"$"#,##0.00';

function cellValue(cell) {
  const v = cell.value;
  if (v && typeof v === 'object') {
    if ('result' in v || 'formula' in v || 'sharedFormula' in v) return v.result ?? null;
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.text) return v.text;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (v.error) return null;
  }
  return v ?? null;
}
const cellFormula = (cell) => (cell.formula || '').replace(/\s+/g, '').toUpperCase();
const isBlank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const asNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const asStr = (v) => (isBlank(v) || typeof v === 'number' ? (typeof v === 'number' ? String(v) : '') : String(v).trim());

// The cells that the layout uses. Other cells are reported as ignored.
const FIXED = new Set(['A1', 'B1', 'C1', 'C2', 'E1', 'F1', 'G1', 'G2', 'I1', 'J1', 'K1', 'K2',
  'M1', 'M2', 'M3', 'N3', 'Q1', 'S1']);
const LIST_COLS = new Set(['A', 'B', 'E', 'F', 'I', 'J', 'Q', 'R', 'S', 'T']);
// User-added summation lists sit in column pairs after Transit: U/V, W/X, ...
const FIRST_CUSTOM_COL = 21;
const colLetter = (k) => { let s = ''; for (let c = k; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s; return s; };

function readList(ws, valCol, labelCol, { keepGaps = 0, kinds = false, colKeys = {}, warnings, sheet } = {}) {
  let last = 1;
  ws.eachRow((row, r) => {
    if (r > 1 && (!isBlank(cellValue(row.getCell(valCol))) || !isBlank(cellValue(row.getCell(labelCol))))) last = r;
  });
  last = Math.max(last, keepGaps + 1);
  const out = [];
  for (let r = 2; r <= last; r++) {
    const vc = ws.getCell(`${valCol}${r}`);
    const raw = cellValue(vc);
    const label = asStr(cellValue(ws.getCell(`${labelCol}${r}`)));
    if (isBlank(raw) && !label && r > keepGaps + 1) continue;
    const row = { amount: asNum(raw), label };
    if (typeof raw === 'string' && !isBlank(raw)) {
      row.label = [label, raw].filter(Boolean).join(' ');
      warnings.push(`${sheet}!${valCol}${r}: text "${raw}" in an amount cell (SUM ignores it). Kept as a note.`);
    }
    if (kinds) {
      const f = cellFormula(vc);
      row.kind = 'manual';
      const linked = f.match(/^SUM\(([A-Z]+):\1\)$/);
      if (linked && colKeys[linked[1]]) { row.kind = colKeys[linked[1]]; row.amount = null; }
      else if (f) warnings.push(`${sheet}!${valCol}${r}: formula =${vc.formula} imported as its value ${row.amount}.`);
    }
    out.push(row);
  }
  return out;
}

function parseRates(ws, settings) {
  const b1 = cellFormula(ws.getCell('B1')).match(/M1\*([\d.]+)/);
  const f1 = cellFormula(ws.getCell('F1')).match(/M1\*([\d.]+)\)?(?:\+([\d.]+))?/);
  const j1 = cellFormula(ws.getCell('J1')).match(/M1\*([\d.]+)/);
  if (b1) settings.wantsRate = Number(b1[1]);
  if (f1) { settings.needsRate = Number(f1[1]); settings.needsExtra = Number(f1[2] || 0); }
  if (j1) settings.savingsRate = Number(j1[1]);
}

export async function importWorkbook(buffer, year) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const doc = emptyYear(year);
  const warnings = [];
  let found = 0;
  MONTHS.forEach((name, i) => {
    const ws = wb.worksheets.find((w) => w.name.trim().toUpperCase() === name);
    if (!ws) { warnings.push(`Sheet ${name} not found. The month is empty.`); return; }
    found++;
    if (found === 1) parseRates(ws, doc.settings);
    // Find user-added list headers (row 1, from column U on) and map their column to a section key.
    const colKeys = { Q: 'groceries', S: 'transit' };
    const extra = [];
    for (let c = FIRST_CUSTOM_COL; c <= FIRST_CUSTOM_COL + 40; c += 2) {
      const title = asStr(cellValue(ws.getCell(`${colLetter(c)}1`)));
      if (!title) continue;
      let sec = doc.sections.find((s) => s.title.toLowerCase() === title.toLowerCase());
      if (!sec) { sec = { key: `x${doc.sections.length + 1}`, title }; doc.sections.push(sec); }
      colKeys[colLetter(c)] = sec.key; extra.push([sec.key, colLetter(c), colLetter(c + 1)]);
    }
    const opts = { warnings, sheet: name, colKeys };
    doc.months[i] = {
      income: asNum(cellValue(ws.getCell('M1'))),
      wants: readList(ws, 'A', 'B', opts),
      needs: readList(ws, 'E', 'F', { ...opts, kinds: true }),
      savings: readList(ws, 'I', 'J', { ...opts, keepGaps: 4 }),
      groceries: readList(ws, 'Q', 'R', opts),
      transit: readList(ws, 'S', 'T', opts),
      custom: {},
    };
    for (const [key, vc, lc] of extra) doc.months[i].custom[key] = readList(ws, vc, lc, opts);
    ws.eachRow((row) => row.eachCell((c) => {
      const v = cellValue(c);
      if (isBlank(v) || FIXED.has(c.address)) return;
      const col = c.address.replace(/\d+/g, '');
      if (LIST_COLS.has(col) || Object.keys(colKeys).includes(col) || extra.some(([, , lc]) => lc === col)) return;
      warnings.push(`${name}!${c.address}: value "${v}" is outside the layout. Not imported.`);
    }));
  });
  if (!found) throw new Error('No month sheets (JAN..DEC) found in this file.');
  const sum = wb.worksheets.find((w) => w.name.trim().toLowerCase() === 'summary');
  if (sum) {
    const f2 = cellFormula(sum.getCell('F2')).match(/^([-\d.]+)\+/);
    doc.settings.rothStart = f2 ? Number(f2[1]) : 0;
    doc.settings.hsa401kIncludeDec = cellFormula(sum.getCell('G2')).includes('DEC!');
    doc.settings.retirementIncludesBank = cellFormula(sum.getCell('D2')).includes('K1');
  }
  return { doc, warnings };
}

export async function exportWorkbook(doc) {
  const s = { ...DEFAULT_SETTINGS, ...doc.settings };
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Ledgy';
  const colOf = Object.fromEntries((doc.sections || []).map((sec, k) => [sec.key, colLetter(FIRST_CUSTOM_COL + 2 * k)]));
  doc.months.forEach((m, i) => {
    const ws = wb.addWorksheet(MONTHS[i]);
    const c = calcMonth(m, s);
    const set = (addr, value, fmt) => { const cell = ws.getCell(addr); cell.value = value; if (fmt) cell.numFmt = fmt; };
    const f = (formula, result) => ({ formula, result: result ?? { error: '#DIV/0!' } });
    set('A1', 'Wants', MONEY); set('B1', f(`(M1*${s.wantsRate})`, c.wantsBudget), MONEY);
    set('C1', f('SUM(A:A)', c.wantsTotal), MONEY); set('C2', f('C1/B1', c.wantsPct), PCT);
    set('E1', 'Needs'); set('F1', f(`(M1*${s.needsRate})+${s.needsExtra}`, c.needsBudget), MONEY);
    set('G1', f('SUM(E:E)', c.needsTotal), MONEY); set('G2', f('G1/F1', c.needsPct), PCT);
    set('I1', 'Savings'); set('J1', f(`M1*${s.savingsRate}`, c.savingsBudget), MONEY);
    set('K1', f('SUM(I:I)', c.savingsTotal), MONEY); set('K2', f('K1/J1', c.savingsPct), PCT);
    if (m.income !== null) set('M1', m.income, MONEY);
    set('M2', f('SUM(C1,G1,K1)', c.allocated), MONEY); set('M3', f('M2/M1', c.allocatedPct));
    set('N3', f('M1-M2', c.remaining), MONEY);
    set('Q1', 'Groceries');
    (doc.sections || []).forEach((sec) => set(`${colOf[sec.key]}1`, sec.title));
    if (m.transit.length || m.needs.some((r) => r.kind === 'transit')) set('S1', 'Transit');
    const list = (rows, vc, lc, fmt) => rows.forEach((r, k) => {
      if (r.amount !== null) set(`${vc}${k + 2}`, r.amount, fmt);
      if (r.label) set(`${lc}${k + 2}`, r.label);
    });
    list(m.wants, 'A', 'B', MONEY);
    m.needs.forEach((r, k) => {
      const a = `E${k + 2}`;
      const lc = r.kind === 'groceries' ? 'Q' : r.kind === 'transit' ? 'S' : colOf[r.kind];
      if (lc) set(a, f(`SUM(${lc}:${lc})`, needsRowValue(r, m)));
      else if (r.amount !== null) set(a, r.amount);
      if (r.label) set(`F${k + 2}`, r.label);
    });
    list(m.savings, 'I', 'J');
    list(m.groceries, 'Q', 'R');
    list(m.transit, 'S', 'T');
    (doc.sections || []).forEach((sec) => list(listRows(m, sec.key), colOf[sec.key], colLetter(FIRST_CUSTOM_COL + 1 + 2 * doc.sections.indexOf(sec)), MONEY));
  });
  const sm = calcSummary(doc);
  const ws = wb.addWorksheet('Summary');
  const heads = ['Total income', 'Total Wants', 'Total Needs', 'Retirement/HSA', 'Bank/Fidelity Savings', 'Roth', 'HSA', '401k'];
  heads.forEach((h, i) => { ws.getCell(1, i + 1).value = h; });
  const refs = (cell, months = MONTHS) => months.map((m) => `${m}!${cell}`).join(',');
  const hsaMonths = s.hsa401kIncludeDec ? MONTHS : MONTHS.slice(0, 11);
  const cells = [
    [`SUM(${refs('M1')})`, sm.totalIncome], [`SUM(${refs('C1')})`, sm.totalWants],
    [`SUM(${refs('G1')})`, sm.totalNeeds],
    [s.retirementIncludesBank ? `SUM(${refs('K1')})` : `SUM(${refs('K1')})-SUM(${refs('I5')})`, sm.retirementHsa],
    [`SUM(${refs('I5')})`, sm.bankSavings], [`${s.rothStart}+SUM(${refs('I4')})`, sm.roth],
    [`SUM(${refs('I3', hsaMonths)})`, sm.hsa], [`SUM(${refs('I2', hsaMonths)})`, sm.k401],
  ];
  cells.forEach(([formula, result], i) => {
    const cell = ws.getCell(2, i + 1); cell.value = { formula, result }; cell.numFmt = USD;
  });
  ws.columns.forEach((col) => { col.width = 20; });
  return wb.xlsx.writeBuffer();
}
