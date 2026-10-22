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
const AUTH = Boolean(AUTH_USER && AUTH_PASS);
const ALLOW_NO_AUTH = process.env.ALLOW_NO_AUTH === '1';
const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
const TRUST_PROXY = process.env.TRUST_PROXY || '';

if (!AUTH && !ALLOW_NO_AUTH) {
  console.error('Ledgy: set BASIC_AUTH_USER and BASIC_AUTH_PASS, or set ALLOW_NO_AUTH=1 to run without a login.');
  process.exit(1);
}

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
// Behind a reverse proxy, TRUST_PROXY makes req.ip the client address (used by the login limit). "1" = one proxy hop.
if (TRUST_PROXY) app.set('trust proxy', /^\d+$/.test(TRUST_PROXY) ? Number(TRUST_PROXY) : TRUST_PROXY === 'true' || TRUST_PROXY);

app.use((_req, res, next) => {
  res.set({
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
      + "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  next();
});
app.get('/healthz', (_req, res) => res.send('ok'));

// Block DNS rebinding: another site's domain pointed at this server. Without a login, only IP addresses,
// localhost and ALLOWED_HOSTS are accepted. With ALLOWED_HOSTS set, only those names (plus localhost) are.
const ipOrLocal = (h) => h === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || /^\[[0-9a-f:.]+\]$/.test(h);
if (ALLOWED_HOSTS.length || !AUTH) {
  app.use((req, res, next) => {
    const host = (req.hostname || '').toLowerCase();
    if (ALLOWED_HOSTS.includes(host) || host === 'localhost' || (!ALLOWED_HOSTS.length && ipOrLocal(host))) return next();
    res.status(421).send(`Host "${host}" is not allowed. Add it to ALLOWED_HOSTS.`);
  });
}

if (AUTH) {
  const same = (a, b) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
  // Lock an address out for 15 minutes after 10 wrong passwords.
  const MAX_FAILS = 10; const LOCK_MS = 15 * 60 * 1000;
  const fails = new Map(); // ip -> { n, reset }
  app.use((req, res, next) => {
    const now = Date.now();
    let f = fails.get(req.ip);
    if (f && now > f.reset) { fails.delete(req.ip); f = null; }
    if (f && f.n >= MAX_FAILS) return res.set('Retry-After', String(Math.ceil((f.reset - now) / 1000))).status(429).send('Too many failed logins. Try again later.');
    const [type, token] = (req.headers.authorization || '').split(' ');
    if (type === 'Basic' && token) {
      const [u, ...p] = Buffer.from(token, 'base64').toString().split(':');
      if (same(u, AUTH_USER) && same(p.join(':'), AUTH_PASS)) { fails.delete(req.ip); return next(); }
      if (fails.size > 10000) for (const [ip, v] of fails) if (now > v.reset) fails.delete(ip);
      fails.set(req.ip, { n: (f?.n || 0) + 1, reset: f?.reset || now + LOCK_MS });
    }
    res.set('WWW-Authenticate', 'Basic realm="Ledgy"').status(401).send('Authentication required');
  });
}

// Block cross-site requests (CSRF). The app sends X-Ledgy on every change; another site cannot add
// that header without a CORS preflight, which this server never allows.
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const site = req.get('sec-fetch-site');
  if (req.get('x-ledgy') === '1' && (!site || site === 'same-origin')) return next();
  res.status(403).json({ error: 'Cross-site request blocked.' });
});

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

app.post('/api/years/:year/import', express.raw({ type: 'application/octet-stream', limit: '5mb' }), async (req, res) => {
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
  try {
    const buf = await exportWorkbook(doc);
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', `attachment; filename="ledgy-${y}.xlsx"`);
    res.send(Buffer.from(buf));
  } catch (e) {
    console.error(`Export of ${y} failed:`, e);
    res.status(500).json({ error: 'Could not create the file.' });
  }
});

app.get('/api/years/:year/backup.json', (req, res) => {
  const y = yearParam(req, res); if (y === null) return;
  const doc = getYear(y);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.set('Content-Disposition', `attachment; filename="ledgy-${y}.json"`).json(doc);
});

app.listen(PORT, () => console.log(`Ledgy on http://0.0.0.0:${PORT} (data: ${DATA_DIR})`));
