import express from 'express';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import client from 'prom-client';
import { randomUUID, randomBytes } from 'node:crypto';

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL; // e.g. postgresql://user:pass@postgres-postgresql:5432/archdb
const TRUST_PROXY = Number(process.env.TRUST_PROXY ?? 2); // ALB -> nginx -> backend
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  JWT_SECRET = randomBytes(32).toString('hex');
  console.warn('WARNING: JWT_SECRET not set - using a random one. Logins reset on every restart. Set JWT_SECRET in production.');
}

/* =====================================================================
   Storage. Postgres (Bitnami) when DATABASE_URL is set, otherwise memory.
   Both stores expose the same interface, so nothing else changes.
   ===================================================================== */
function memoryStore() {
  const users = new Map();     // username_lower -> user
  const diagrams = new Map();  // id -> diagram
  const now = () => new Date().toISOString();
  return {
    kind: 'memory',
    ready: () => true,
    async createUser(username, password_hash) {
      const key = username.toLowerCase();
      if (users.has(key)) return null;
      const u = { id: randomUUID(), username, password_hash };
      users.set(key, u); return { id: u.id, username };
    },
    async findUser(username) { return users.get(username.toLowerCase()) || null; },
    async list(userId) {
      return [...diagrams.values()].filter((d) => d.user_id === userId)
        .map(({ id, name, updated_at }) => ({ id, name, updated_at }))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    },
    async get(userId, id) { const d = diagrams.get(id); return d && d.user_id === userId ? d : null; },
    async create(userId, name, data) {
      const d = { id: randomUUID(), user_id: userId, name, data, updated_at: now() };
      diagrams.set(d.id, d); return d;
    },
    async update(userId, id, name, data) {
      const d = diagrams.get(id);
      if (!d || d.user_id !== userId) return null;
      Object.assign(d, { name, data, updated_at: now() }); return d;
    },
    async remove(userId, id) {
      const d = diagrams.get(id);
      return d && d.user_id === userId ? diagrams.delete(id) : false;
    },
  };
}

function pgStore(url) {
  const pool = new pg.Pool({ connectionString: url });
  let isReady = false;
  (async function init() {   // retries until the DB exists, so the app can start before Bitnami is installed
    for (;;) {
      try {
        await pool.query(`CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY,
          username TEXT NOT NULL,
          username_lower TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
        await pool.query(`CREATE TABLE IF NOT EXISTS diagrams (
          id UUID PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
        await pool.query('CREATE INDEX IF NOT EXISTS diagrams_user_idx ON diagrams(user_id)');
        isReady = true; console.log('postgres ready'); return;
      } catch (e) { console.error('waiting for postgres:', e.message); await sleep(5000); }
    }
  })();
  return {
    kind: 'postgres',
    ready: () => isReady,
    async createUser(username, password_hash) {
      try {
        const id = randomUUID();
        await pool.query('INSERT INTO users (id, username, username_lower, password_hash) VALUES ($1,$2,$3,$4)',
          [id, username, username.toLowerCase(), password_hash]);
        return { id, username };
      } catch (e) { if (e.code === '23505') return null; throw e; }   // unique violation = name taken
    },
    async findUser(username) {
      return (await pool.query('SELECT id, username, password_hash FROM users WHERE username_lower=$1',
        [username.toLowerCase()])).rows[0] || null;
    },
    async list(userId) {
      return (await pool.query('SELECT id, name, updated_at FROM diagrams WHERE user_id=$1 ORDER BY updated_at DESC', [userId])).rows;
    },
    async get(userId, id) {
      return (await pool.query('SELECT * FROM diagrams WHERE id=$1 AND user_id=$2', [id, userId])).rows[0] || null;
    },
    async create(userId, name, data) {
      return (await pool.query('INSERT INTO diagrams (id,user_id,name,data) VALUES ($1,$2,$3,$4) RETURNING *',
        [randomUUID(), userId, name, data])).rows[0];
    },
    async update(userId, id, name, data) {
      return (await pool.query('UPDATE diagrams SET name=$3, data=$4, updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *',
        [id, userId, name, data])).rows[0] || null;
    },
    async remove(userId, id) {
      return (await pool.query('DELETE FROM diagrams WHERE id=$1 AND user_id=$2', [id, userId])).rowCount > 0;
    },
  };
}

const store = DATABASE_URL ? pgStore(DATABASE_URL) : memoryStore();

/* ============================== App ============================== */
const app = express();
app.set('trust proxy', TRUST_PROXY);
app.use(cors());
app.use(express.json({ limit: '5mb' }));

/* ---------- Prometheus metrics (scraped by the ServiceMonitor) ---------- */
client.collectDefaultMetrics();
const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
});
app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on('finish', () => end({
    method: req.method,
    route: req.route ? req.baseUrl + req.route.path : 'unmatched',   // route pattern, not the raw URL
    status_code: res.statusCode,
  }));
  next();
});
// Not reachable from outside: nginx only proxies /api/ to the backend.
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.get('/healthz', (_req, res) => res.send('ok'));                                              // liveness
app.get('/readyz', (_req, res) => (store.ready() ? res.send('ready') : res.status(503).send('db not ready'))); // readiness
app.get('/api/info', (_req, res) => res.json({ storage: store.kind }));

const guard = (fn) => async (req, res) => {
  if (!store.ready()) return res.status(503).json({ error: 'database not ready' });
  try { await fn(req, res); } catch (e) { console.error(e); res.status(500).json({ error: 'internal error' }); }
};

/* ---------- auth ---------- */
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10); // keeps login timing equal for unknown users
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
const sign = (u) => jwt.sign({ username: u.username }, JWT_SECRET, { subject: u.id, expiresIn: '7d', algorithm: 'HS256' });

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'too many attempts, try again later' } });

const requireAuth = (req, res, next) => {
  const h = req.headers.authorization || '';
  try {
    const p = jwt.verify(h.startsWith('Bearer ') ? h.slice(7) : '', JWT_SECRET, { algorithms: ['HS256'] });
    req.user = { id: p.sub, username: p.username };
    next();
  } catch { res.status(401).json({ error: 'unauthorized' }); }
};

app.post('/api/auth/register', authLimiter, guard(async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || !USERNAME_RE.test(username))
    return res.status(400).json({ error: 'Username must be 3-32 characters: letters, numbers, . _ -' });
  if (typeof password !== 'string' || password.length < 8 || password.length > 72)
    return res.status(400).json({ error: 'Password must be 8-72 characters' });
  const user = await store.createUser(username, await bcrypt.hash(password, 10));
  if (!user) return res.status(409).json({ error: 'That username is taken' });
  res.status(201).json({ token: sign(user), user });
}));

app.post('/api/auth/login', authLimiter, guard(async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string')
    return res.status(400).json({ error: 'Enter a username and password' });
  const u = await store.findUser(username);
  const ok = await bcrypt.compare(password, u ? u.password_hash : DUMMY_HASH);
  if (!u || !ok) return res.status(401).json({ error: 'Wrong username or password' });
  const user = { id: u.id, username: u.username };
  res.json({ token: sign(user), user });
}));

app.get('/api/auth/me', requireAuth, (req, res) => res.json(req.user));

/* ---------- diagrams (always scoped to the logged-in user) ---------- */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const valid = (b) => b && typeof b.name === 'string' && b.data && Array.isArray(b.data.nodes) && Array.isArray(b.data.edges);
const notFound = (res) => res.status(404).json({ error: 'not found' });

app.get('/api/diagrams', requireAuth, guard(async (req, res) => res.json(await store.list(req.user.id))));

app.get('/api/diagrams/:id', requireAuth, guard(async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return notFound(res);
  const d = await store.get(req.user.id, req.params.id);
  d ? res.json(d) : notFound(res);
}));

app.post('/api/diagrams', requireAuth, guard(async (req, res) => {
  if (!valid(req.body)) return res.status(400).json({ error: 'expected { name, data: { nodes, edges } }' });
  res.status(201).json(await store.create(req.user.id, req.body.name.slice(0, 120), req.body.data));
}));

app.put('/api/diagrams/:id', requireAuth, guard(async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return notFound(res);
  if (!valid(req.body)) return res.status(400).json({ error: 'expected { name, data: { nodes, edges } }' });
  const d = await store.update(req.user.id, req.params.id, req.body.name.slice(0, 120), req.body.data);
  d ? res.json(d) : notFound(res);
}));

app.delete('/api/diagrams/:id', requireAuth, guard(async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return notFound(res);
  (await store.remove(req.user.id, req.params.id)) ? res.status(204).end() : notFound(res);
}));

app.listen(PORT, () => console.log(`backend on :${PORT} (storage: ${store.kind})`));
