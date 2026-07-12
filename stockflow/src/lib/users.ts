import crypto from "node:crypto";
import { getDb } from "./db";
import { id as makeId, now } from "./util";

export type Role = "super_admin" | "admin" | "user";

/**
 * Permission areas. Each nav page and API path maps to one area.
 * - super_admin: everything, always (plus users management and export)
 * - admin: the set chosen by the super admin (Settings -> Users & Roles)
 * - user: fixed day-to-day operations set
 */
export const AREAS = [
  "dashboard",
  "items",
  "stock",
  "estimates",
  "sales_orders",
  "invoices",
  "purchasing",
  "manufacturing",
  "reports",
  "customers",
  "vendors",
  "locations",
  "import",
  "api_keys",
  "webhooks",
  "integrations",
  "events",
  "export",
  "users",
] as const;
export type Area = (typeof AREAS)[number];

export const USER_AREAS: Area[] = [
  "dashboard",
  "items",
  "stock",
  "estimates",
  "sales_orders",
  "invoices",
  "purchasing",
  "manufacturing",
  "reports",
  "customers",
  "vendors",
  "locations",
];

export const DEFAULT_ADMIN_AREAS: Area[] = AREAS.filter((a) => a !== "users" && a !== "export");

export function adminAreas(): Area[] {
  const row = getDb().prepare("SELECT value FROM app_settings WHERE key = 'admin_areas'").get() as
    | { value: string }
    | undefined;
  if (!row) return [...DEFAULT_ADMIN_AREAS];
  try {
    const parsed = JSON.parse(row.value) as string[];
    return parsed.filter((a): a is Area => (AREAS as readonly string[]).includes(a));
  } catch {
    return [...DEFAULT_ADMIN_AREAS];
  }
}

export function saveAdminAreas(areas: string[]): Area[] {
  const clean = [
    ...new Set(areas.filter((a) => (AREAS as readonly string[]).includes(a))),
  ].filter((a) => a !== "users" && a !== "export") as Area[]; // reserved for super admin
  if (!clean.includes("dashboard")) clean.unshift("dashboard");
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('admin_areas', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(JSON.stringify(clean), now());
  return clean;
}

export function areasForRole(role: Role): Area[] {
  if (role === "super_admin") return [...AREAS];
  if (role === "admin") return adminAreas();
  return [...USER_AREAS];
}

/* ---------- passwords & sessions ---------- */

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

export type SessionUser = { id: string; name: string; email: string; role: Role };

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export function createSession(userId: string): string {
  const token = `sfs_${crypto.randomBytes(24).toString("hex")}`;
  const db = getDb();
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(
    hashToken(token),
    userId,
    new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
    now()
  );
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now());
  return token;
}

export function destroySession(token: string): void {
  getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

export function userForSession(token: string): SessionUser | undefined {
  const row = getDb()
    .prepare(
      `SELECT u.id, u.name, u.email, u.role FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`
    )
    .get(hashToken(token), now()) as SessionUser | undefined;
  return row;
}

export function sessionTokenFromCookie(cookieHeader: string | null): string | undefined {
  const match = /(?:^|;\s*)sf_session=([^;]+)/.exec(cookieHeader || "");
  return match?.[1];
}

export function userCount(): number {
  return (getDb().prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
}

export function createUser(name: string, email: string, password: string, role: Role): SessionUser {
  const db = getDb();
  const userId = makeId("usr");
  const ts = now();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)"
  ).run(userId, name, email.toLowerCase().trim(), hashPassword(password), role, ts, ts);
  return { id: userId, name, email: email.toLowerCase().trim(), role };
}

/* ---------- API path -> area ---------- */

const PATH_AREAS: Record<string, Area> = {
  dashboard: "dashboard",
  items: "items",
  stock: "stock",
  estimates: "estimates",
  "sales-orders": "sales_orders",
  invoices: "invoices",
  "purchase-orders": "purchasing",
  boms: "manufacturing",
  "work-orders": "manufacturing",
  customers: "customers",
  vendors: "vendors",
  locations: "locations",
  import: "import",
  "api-keys": "api_keys",
  webhooks: "webhooks",
  deliveries: "webhooks",
  integrations: "integrations",
  events: "events",
  export: "export",
  users: "users",
  permissions: "users",
};

/** Which permission area an /api/v1 path belongs to; undefined = any authenticated user. */
export function areaOfPath(pathname: string): Area | undefined {
  const segment = pathname.replace(/^\/api\/v1\//, "").split("/")[0];
  return PATH_AREAS[segment];
}
