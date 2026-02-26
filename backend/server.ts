import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';

const app = express();
app.use(express.json());

// ======================
// ENV
// ======================
const PORT = Number(process.env.PORT || 10000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const DATABASE_URL = process.env.DATABASE_URL || '';
const CORS_ORIGIN = (process.env.CORS_ORIGIN || '*').trim();

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (CORS_ORIGIN === '*') return cb(null, true);
      const allowed = CORS_ORIGIN.split(',').map((s) => s.trim());
      return cb(null, allowed.includes(origin));
    },
  })
);

// ======================
// DB
// ======================
const pool = new Pool({
  connectionString: DATABASE_URL || undefined,
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : undefined,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','user')),
      must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT,
      quantity INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('CARICO','SCARICO')),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      note TEXT,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Seed admin solo se non esiste
  const existing = await pool.query(
    `SELECT id FROM users WHERE username=$1 LIMIT 1`,
    [ADMIN_USERNAME]
  );

  if (existing.rowCount === 0) {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await pool.query(
      `INSERT INTO users (id, username, password_hash, role, must_change_password)
       VALUES ($1,$2,$3,'admin',FALSE)`,
      ['admin-1', ADMIN_USERNAME, hash]
    );
  }
}

// ======================
// AUTH
// ======================
type JwtPayload = { sub: string; role: 'admin' | 'user' };

function signToken(id: string, role: 'admin' | 'user') {
  return jwt.sign({ sub: id, role }, JWT_SECRET, { expiresIn: '7d' });
}

function auth(req: Request, res: Response, next: NextFunction) {
  const h = req.header('Authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: 'Token mancante' });

  try {
    const payload = jwt.verify(m[1], JWT_SECRET) as JwtPayload;
    (req as any).user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Token non valido o scaduto' });
  }
}

function adminOnly(req: Request, res: Response, next: NextFunction) {
  const u = (req as any).user as JwtPayload;
  if (!u || u.role !== 'admin')
    return res.status(403).json({ error: 'Solo amministratore' });
  next();
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
}

// ======================
// LOGIN
// ======================
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  const r = await pool.query(
    `SELECT * FROM users WHERE username=$1 LIMIT 1`,
    [username]
  );

  if (r.rowCount === 0)
    return res.status(401).json({ error: 'Credenziali non valide' });

  const user = r.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);

  if (!ok)
    return res.status(401).json({ error: 'Credenziali non valide' });

  const token = signToken(user.id, user.role);

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      mustChangePassword: user.must_change_password,
      createdAt: user.created_at,
    },
  });
});

// ======================
// CAMBIO PASSWORD
// ======================
app.post('/api/me/password', auth, async (req, res) => {
  const u = (req as any).user as JwtPayload;
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword)
    return res.status(400).json({ error: 'Dati mancanti' });

  const r = await pool.query(
    `SELECT * FROM users WHERE id=$1 LIMIT 1`,
    [u.sub]
  );

  if (r.rowCount === 0)
    return res.status(404).json({ error: 'Utente non trovato' });

  const user = r.rows[0];
  const ok = await bcrypt.compare(oldPassword, user.password_hash);

  if (!ok)
    return res.status(401).json({ error: 'Password attuale non corretta' });

  const hash = await bcrypt.hash(newPassword, 10);

  await pool.query(
    `UPDATE users SET password_hash=$1, must_change_password=FALSE WHERE id=$2`,
    [hash, u.sub]
  );

  res.json({ ok: true });
});

// ======================
// USERS (ADMIN)
// ======================
app.get('/api/users', auth, adminOnly, async (_req, res) => {
  const r = await pool.query(
    `SELECT id, username, role, must_change_password, created_at FROM users`
  );
  res.json(r.rows);
});

app.post('/api/users', auth, adminOnly, async (req, res) => {
  const { username, role } = req.body;

  const rawPassword = '1234';
  const hash = await bcrypt.hash(rawPassword, 10);

  const id = uid('usr');

  await pool.query(
    `INSERT INTO users (id, username, password_hash, role, must_change_password)
     VALUES ($1,$2,$3,$4,TRUE)`,
    [id, username, hash, role || 'user']
  );

  res.status(201).json({ ok: true });
});

// ======================
// START
// ======================
(async () => {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Backend avviato su porta ${PORT}`);
  });
})();