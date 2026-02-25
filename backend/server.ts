import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

dotenv.config();

// ---------- Config ----------
const PORT = parseInt(process.env.PORT || "10000", 10);
const NODE_ENV = process.env.NODE_ENV || "development";

const JWT_SECRET = process.env.JWT_SECRET || "change-me-please";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin"; // set in Render env
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

const DATABASE_URL = process.env.DATABASE_URL || "";

// ---------- Types ----------
type Role = "admin" | "user";

type User = {
  id: string;
  username: string;
  passwordHash: string;
  role: Role;
  createdAt: string;
};

type Product = {
  id: string;
  name: string;
  sku?: string | null;
  quantity: number;
  updatedAt: string;
};

type Transaction = {
  id: string;
  productId: string;
  type: "CARICO" | "SCARICO";
  quantity: number;
  note?: string | null;
  createdAt: string;
};

type CloudPayload = {
  products: Product[];
  transactions: Transaction[];
  users: Array<Pick<User, "id" | "username" | "role" | "createdAt">>;
};

// ---------- Helpers ----------
function nowISO() {
  return new Date().toISOString();
}

function uid(prefix = "") {
  return (
    prefix +
    Math.random().toString(16).slice(2) +
    "-" +
    Date.now().toString(16)
  );
}

function safeUser(u: User) {
  return { id: u.id, username: u.username, role: u.role, createdAt: u.createdAt };
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; role: Role };
    (req as any).auth = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = (req as any).auth as { role?: Role } | undefined;
  if (!auth?.role || auth.role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
}

// ---------- Storage Layer (DB or Memory) ----------
interface Storage {
  init(): Promise<void>;
  getCloud(): Promise<CloudPayload>;

  login(username: string, password: string): Promise<User | null>;

  listProducts(): Promise<Product[]>;
  upsertProduct(p: Partial<Product> & { name: string; quantity: number; id?: string }): Promise<Product>;
  deleteProduct(id: string): Promise<void>;

  listTransactions(): Promise<Transaction[]>;
  addTransaction(t: { productId: string; type: "CARICO" | "SCARICO"; quantity: number; note?: string | null }): Promise<Transaction>;

  listUsers(): Promise<Array<Pick<User, "id" | "username" | "role" | "createdAt">>>;
  createUser(u: { username: string; password: string; role: Role }): Promise<Pick<User, "id" | "username" | "role" | "createdAt">>;
  deleteUser(id: string): Promise<void>;
}

class MemoryStorage implements Storage {
  private users: User[] = [];
  private products: Product[] = [];
  private transactions: Transaction[] = [];

  async init() {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    this.users = [{
      id: "admin-1",
      username: ADMIN_USERNAME,
      passwordHash,
      role: "admin",
      createdAt: nowISO(),
    }];
  }

  async getCloud(): Promise<CloudPayload> {
    return {
      products: this.products,
      transactions: this.transactions,
      users: this.users.map(safeUser),
    };
  }

  async login(username: string, password: string) {
    const u = this.users.find(x => x.username === username);
    if (!u) return null;
    const ok = await bcrypt.compare(password, u.passwordHash);
    return ok ? u : null;
  }

  async listProducts() { return this.products; }

  async upsertProduct(p: Partial<Product> & { name: string; quantity: number; id?: string }) {
    const id = p.id || uid("prod-");
    const existing = this.products.find(x => x.id === id);
    const updated: Product = {
      id,
      name: p.name,
      sku: p.sku ?? null,
      quantity: p.quantity,
      updatedAt: nowISO(),
    };
    if (existing) {
      Object.assign(existing, updated);
      return existing;
    }
    this.products.push(updated);
    return updated;
  }

  async deleteProduct(id: string) {
    this.products = this.products.filter(p => p.id !== id);
    this.transactions = this.transactions.filter(t => t.productId !== id);
  }

  async listTransactions() { return this.transactions; }

  async addTransaction(t: { productId: string; type: "CARICO" | "SCARICO"; quantity: number; note?: string | null }) {
    const trx: Transaction = {
      id: uid("trx-"),
      productId: t.productId,
      type: t.type,
      quantity: t.quantity,
      note: t.note ?? null,
      createdAt: nowISO(),
    };
    this.transactions.push(trx);

    const p = this.products.find(x => x.id === t.productId);
    if (p) {
      if (t.type === "CARICO") p.quantity += t.quantity;
      else p.quantity -= t.quantity;
      p.updatedAt = nowISO();
    }
    return trx;
  }

  async listUsers() {
    return this.users.map(safeUser);
  }

  async createUser(u: { username: string; password: string; role: Role }) {
    if (this.users.some(x => x.username === u.username)) {
      throw new Error("USERNAME_EXISTS");
    }
    const passwordHash = await bcrypt.hash(u.password, 10);
    const nu: User = {
      id: uid("usr-"),
      username: u.username,
      passwordHash,
      role: u.role,
      createdAt: nowISO(),
    };
    this.users.push(nu);
    return safeUser(nu);
  }

  async deleteUser(id: string) {
    if (id === "admin-1") return;
    this.users = this.users.filter(u => u.id !== id);
  }
}

// NOTE: PostgresStorage is included but used only if DATABASE_URL is provided.
// This keeps the project "a prova di scemo": it runs even without DB.

class PostgresStorage implements Storage {
  private pool: any;

  constructor(private url: string) {}

  async init() {
    const pg = await import("pg");
    const { Pool } = pg as any;

    this.pool = new Pool({
      connectionString: this.url,
      ssl: { rejectUnauthorized: false },
    });

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS app_users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sku TEXT,
        quantity INTEGER NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL
      );
    `);

    const r = await this.pool.query(`SELECT id FROM app_users WHERE username=$1 LIMIT 1`, [ADMIN_USERNAME]);
    if (r.rowCount === 0) {
      const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await this.pool.query(
        `INSERT INTO app_users (id, username, password_hash, role, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        ["admin-1", ADMIN_USERNAME, passwordHash, "admin", nowISO()]
      );
    }
  }

  async getCloud(): Promise<CloudPayload> {
    const [products, transactions, users] = await Promise.all([
      this.listProducts(),
      this.listTransactions(),
      this.listUsers(),
    ]);
    return { products, transactions, users };
  }

  async login(username: string, password: string) {
    const r = await this.pool.query(
      `SELECT id, username, password_hash, role, created_at FROM app_users WHERE username=$1 LIMIT 1`,
      [username]
    );
    if (r.rowCount === 0) return null;
    const row = r.rows[0];
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return null;
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      role: row.role,
      createdAt: new Date(row.created_at).toISOString(),
    } as User;
  }

  async listProducts() {
    const r = await this.pool.query(`SELECT id, name, sku, quantity, updated_at FROM products ORDER BY name ASC`);
    return r.rows.map((x: any) => ({
      id: x.id,
      name: x.name,
      sku: x.sku,
      quantity: x.quantity,
      updatedAt: new Date(x.updated_at).toISOString(),
    })) as Product[];
  }

  async upsertProduct(p: Partial<Product> & { name: string; quantity: number; id?: string }) {
    const id = p.id || uid("prod-");
    const sku = p.sku ?? null;
    const updatedAt = nowISO();

    await this.pool.query(
      `INSERT INTO products (id, name, sku, quantity, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         sku = EXCLUDED.sku,
         quantity = EXCLUDED.quantity,
         updated_at = EXCLUDED.updated_at`,
      [id, p.name, sku, p.quantity, updatedAt]
    );

    return { id, name: p.name, sku, quantity: p.quantity, updatedAt };
  }

  async deleteProduct(id: string) {
    await this.pool.query(`DELETE FROM products WHERE id=$1`, [id]);
  }

  async listTransactions() {
    const r = await this.pool.query(
      `SELECT id, product_id, type, quantity, note, created_at
       FROM transactions
       ORDER BY created_at DESC`
    );
    return r.rows.map((x: any) => ({
      id: x.id,
      productId: x.product_id,
      type: x.type,
      quantity: x.quantity,
      note: x.note,
      createdAt: new Date(x.created_at).toISOString(),
    })) as Transaction[];
  }

  async addTransaction(t: { productId: string; type: "CARICO" | "SCARICO"; quantity: number; note?: string | null }) {
    const id = uid("trx-");
    const createdAt = nowISO();
    const note = t.note ?? null;

    await this.pool.query("BEGIN");
    try {
      await this.pool.query(
        `INSERT INTO transactions (id, product_id, type, quantity, note, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, t.productId, t.type, t.quantity, note, createdAt]
      );

      const delta = t.type === "CARICO" ? t.quantity : -t.quantity;
      await this.pool.query(
        `UPDATE products
         SET quantity = quantity + $2,
             updated_at = $3
         WHERE id = $1`,
        [t.productId, delta, createdAt]
      );

      await this.pool.query("COMMIT");
    } catch (e) {
      await this.pool.query("ROLLBACK");
      throw e;
    }

    return { id, productId: t.productId, type: t.type, quantity: t.quantity, note, createdAt };
  }

  async listUsers() {
    const r = await this.pool.query(`SELECT id, username, role, created_at FROM app_users ORDER BY created_at ASC`);
    return r.rows.map((x: any) => ({
      id: x.id,
      username: x.username,
      role: x.role,
      createdAt: new Date(x.created_at).toISOString(),
    }));
  }

  async createUser(u: { username: string; password: string; role: Role }) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    const id = uid("usr-");
    const createdAt = nowISO();
    await this.pool.query(
      `INSERT INTO app_users (id, username, password_hash, role, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, u.username, passwordHash, u.role, createdAt]
    );
    return { id, username: u.username, role: u.role, createdAt };
  }

  async deleteUser(id: string) {
    if (id === "admin-1") return;
    await this.pool.query(`DELETE FROM app_users WHERE id=$1`, [id]);
  }
}

const storage: Storage = DATABASE_URL ? new PostgresStorage(DATABASE_URL) : new MemoryStorage();

// ---------- App + Socket ----------
const app = express();
app.use(cors({ origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, env: NODE_ENV, db: !!DATABASE_URL }));

// ---- Auth ----
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username/password required" });

  const u = await storage.login(String(username), String(password));
  if (!u) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign({ sub: u.id, role: u.role }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: safeUser(u) });
});

// ---- Cloud snapshot ----
app.get("/api/cloud", requireAuth, async (_req, res) => {
  res.json(await storage.getCloud());
});

// ---- Products ----
app.get("/api/products", requireAuth, async (_req, res) => {
  res.json(await storage.listProducts());
});

app.post("/api/products", requireAuth, requireAdmin, async (req, res) => {
  const { id, name, sku, quantity } = req.body || {};
  if (!name || typeof quantity !== "number") return res.status(400).json({ error: "name + quantity required" });

  const p = await storage.upsertProduct({ id, name, sku, quantity });
  await broadcastCloud();
  res.json(p);
});

app.delete("/api/products/:id", requireAuth, requireAdmin, async (req, res) => {
  await storage.deleteProduct(req.params.id);
  await broadcastCloud();
  res.json({ ok: true });
});

// ---- Transactions ----
app.get("/api/transactions", requireAuth, async (_req, res) => {
  res.json(await storage.listTransactions());
});

app.post("/api/transactions", requireAuth, async (req, res) => {
  const { productId, type, quantity, note } = req.body || {};
  if (!productId || (type !== "CARICO" && type !== "SCARICO") || typeof quantity !== "number") {
    return res.status(400).json({ error: "productId + type(CARICO|SCARICO) + quantity required" });
  }
  const trx = await storage.addTransaction({ productId, type, quantity, note: note ?? null });
  await broadcastCloud();
  res.json(trx);
});

// ---- Users (admin) ----
app.get("/api/users", requireAuth, requireAdmin, async (_req, res) => {
  res.json(await storage.listUsers());
});

app.post("/api/users", requireAuth, requireAdmin, async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password || (role !== "admin" && role !== "user")) {
    return res.status(400).json({ error: "username + password + role(admin|user) required" });
  }
  try {
    const u = await storage.createUser({ username, password, role });
    await broadcastCloud();
    res.json(u);
  } catch (e: any) {
    return res.status(409).json({ error: "Create user failed (maybe username exists)" });
  }
});

app.delete("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
  await storage.deleteUser(req.params.id);
  await broadcastCloud();
  res.json({ ok: true });
});

// ---- HTTP + Socket.IO ----
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: { origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN, credentials: true },
});

io.use((socket, next) => {
  const token =
    (socket.handshake.auth?.token as string | undefined) ||
    (socket.handshake.headers.authorization?.toString().startsWith("Bearer ")
      ? socket.handshake.headers.authorization!.toString().slice(7)
      : "");

  if (!token) return next(new Error("Missing token"));
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; role: Role };
    (socket as any).auth = decoded;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

io.on("connection", async (socket) => {
  socket.emit("cloud:snapshot", await storage.getCloud());
  socket.on("cloud:pull", async () => {
    socket.emit("cloud:snapshot", await storage.getCloud());
  });
});

async function broadcastCloud() {
  const payload = await storage.getCloud();
  io.emit("cloud:update", payload);
}

// ---------- Start ----------
(async () => {
  await storage.init();

  server.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`   Health: /health`);
    console.log(`   DB: ${DATABASE_URL ? "PostgreSQL" : "Memory (no DATABASE_URL)"}`);
  });
})();
