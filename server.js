import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, renameSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyYear, emptyMonth, normalizeYear } from './lib/calc.js';
import { importWorkbook, exportWorkbook } from './lib/xlsx-io.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(here, 'data');
const AUTH_USER = process.env.BASIC_AUTH_USER || '';
const AUTH_PASS = process.env.BASIC_AUTH_PASS || '';

mkdirSync(DATA_DIR, { recursive: true });
// Older versions named the file budget.db. Rename it once, with its WAL files.
const dataFile = (name) => path.join(DATA_DIR, name);
if (existsSync(dataFile('budget.db')) && !existsSync(dataFile('ledgy.db'))) {
  for (const ext of ['', '-wal', '-shm']) {
    if (existsSync(dataFile(`budget.db${ext}`))) renameSync(dataFile(`budget.db${ext}`), dataFile(`ledgy.db${ext}`));
  }
}
const db = new DatabaseSync(path.join(DATA_DIR, 'ledgy.db'));
db.exec(`PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS years (year INTEGER PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);`);

const getYear = (y) => {
  const row = db.prepare('SELECT data, updated_at FROM years WHERE year = ?').get(y);
  return row ? { ...normalizeYear(JSON.parse(row.data), y), updatedAt: row.updated_at } : null;
};
const saveYear = (y, doc) => {
  const clean = normalizeYear(doc, y);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO years (year, data, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(year) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
    .run(y, JSON.stringify(clean), now);
  return { ...clean, updatedAt: now };
};

const app = express();
app.disable('x-powered-by');
app.get('/healthz', (_req, res) => res.send('ok'));

if (AUTH_USER && AUTH_PASS) {
  const same = (a, b) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
  app.use((req, res, next) => {
    const [type, token] = (req.headers.authorization || '').split(' ');
    if (type === 'Basic' && token) {
      const [u, ...p] = Buffer.from(token, 'base64').toString().split(':');
      if (same(u, AUTH_USER) && same(p.join(':'), AUTH_PASS)) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Ledgy"').status(401).send('Authentication required');
  });
}

app.use(express.json({ limit: '5mb' }));
app.use('/lib', express.static(path.join(here, 'lib')));
app.use('/vendor', express.static(path.join(here, 'node_modules/chart.js/dist')));
app.use(express.static(path.join(here, 'public')));

const yearParam = (req, res) => {
  const y = Number(req.params.year);
  if (!Number.isInteger(y) || y < 1900 || y > 3000) { res.status(400).json({ error: 'Bad year' }); return null; }
  return y;
};

app.get('/api/years', (_req, res) => {
  res.json(db.prepare('SELECT year, updated_at AS updatedAt FROM years ORDER BY year').all());
});

app.get('/api/years/:year', (req, res) => {
  const y = yearParam(req, res); if (y === null) return;
  const doc = getYear(y);
  doc ? res.json(doc) : res.status(404).json({ error: 'Not found' });
});

app.put('/api/years/:year', (req, res) => {
  const y = yearParam(req, res); if (y === null) return;
  const cur = getYear(y);
  // Stop a stale tab from overwriting newer data.
  if (cur && req.body.updatedAt && req.body.updatedAt !== cur.updatedAt) {
    return res.status(409).json({ error: 'This year was changed in another window. Reload to get the latest data.' });
  }
  res.json(saveYear(y, req.body));
});

// Create a year. Optional "from": copy the needs labels and savings rows of the last month of that year.
app.post('/api/years/:year', (req, res) => {
  const y = yearParam(req, res); if (y === null) return;
  if (getYear(y)) return res.status(409).json({ error: 'Year exists' });
  const doc = emptyYear(y);
  const src = req.body?.from ? getYear(Number(req.body.from)) : null;
  if (src) {
    doc.settings = { ...src.settings, rothStart: 0 };
    const last = src.months[11];
    doc.months = doc.months.map(() => ({
      ...emptyMonth(),
      needs: last.needs.filter((r) => r.label || r.kind !== 'manual').map((r) => ({ label: r.label, kind: r.kind, amount: null })),
      savings: last.savings.map((r) => ({ ...r })),
    }));
  }
  res.status(201).json(saveYear(y, doc));
});

app.delete('/api/years/:year', (req, res) => {
  const y = yearParam(req, res); if (y === null) return;
  db.prepare('DELETE FROM years WHERE year = ?').run(y);
  res.status(204).end();
});

app.post('/api/years/:year/import', express.raw({ type: '*/*', limit: '20mb' }), async (req, res) => {
  const y = yearParam(req, res); if (y === null) return;
  if (getYear(y) && req.query.overwrite !== '1') return res.status(409).json({ error: 'Year exists' });
  try {
    const { doc, warnings } = await importWorkbook(req.body, y);
    res.json({ doc: saveYear(y, doc), warnings });
  } catch (e) {
    res.status(400).json({ error: `Could not read the file: ${e.message}` });
  }
});

app.get('/api/years/:year/export.xlsx', async (req, res) => {
  const y = yearParam(req, res); if (y === null) return;
  const doc = getYear(y);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  const buf = await exportWorkbook(doc);
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="ledgy-${y}.xlsx"`);
  res.send(Buffer.from(buf));
});

app.get('/api/years/:year/backup.json', (req, res) => {
  const y = yearParam(req, res); if (y === null) return;
  const doc = getYear(y);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.set('Content-Disposition', `attachment; filename="ledgy-${y}.json"`).json(doc);
});

app.listen(PORT, () => console.log(`Ledgy on http://0.0.0.0:${PORT} (data: ${DATA_DIR})`));
