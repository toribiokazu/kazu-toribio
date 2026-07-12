import crypto from "node:crypto";
import { getDb } from "./db";
import {
  areaOfPath,
  areasForRole,
  sessionTokenFromCookie,
  userCount,
  userForSession,
  type SessionUser,
} from "./users";
import { ApiError, id, now } from "./util";

export type Auth =
  | { via: "api_key"; keyId: string; scope: "full" | "read" }
  | { via: "user"; user: SessionUser }
  | { via: "bootstrap" };

export function hashKey(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createApiKey(name: string, scope: "full" | "read") {
  const token = `sfk_${crypto.randomBytes(24).toString("hex")}`;
  const db = getDb();
  const keyId = id("key");
  db.prepare(
    "INSERT INTO api_keys (id, name, prefix, hash, scope, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(keyId, name, token.slice(0, 10), hashKey(token), scope, now());
  // The full token is only shown once, at creation time.
  return { id: keyId, name, scope, token, prefix: token.slice(0, 10) };
}

/**
 * Authenticate + authorize a request to /api/v1.
 *
 * - `Authorization: Bearer sfk_...` -> API key (machine access, all areas;
 *   read-only keys can't hit write endpoints).
 * - Browser requests (same-origin) -> the logged-in user's session cookie.
 *   The user's role decides which areas they may touch: super_admin gets
 *   everything, admin gets the set chosen by the super admin, user gets
 *   the fixed operations set.
 * - Before any user exists (fresh install), same-origin requests pass so
 *   the setup screen and seed script can run.
 */
export function authenticate(req: Request, write: boolean): Auth {
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (match) {
    const db = getDb();
    const row = db
      .prepare("SELECT id, scope, revoked_at FROM api_keys WHERE hash = ?")
      .get(hashKey(match[1])) as { id: string; scope: "full" | "read"; revoked_at: string } | undefined;
    if (!row || row.revoked_at) throw new ApiError(401, "Invalid API key");
    if (write && row.scope !== "full") throw new ApiError(403, "This API key is read-only");
    db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(now(), row.id);
    return { via: "api_key", keyId: row.id, scope: row.scope };
  }

  if (req.headers.get("sec-fetch-site") === "same-origin") {
    if (userCount() === 0) return { via: "bootstrap" };
    const token = sessionTokenFromCookie(req.headers.get("cookie"));
    const user = token ? userForSession(token) : undefined;
    if (!user) throw new ApiError(401, "Not signed in — reload the page and sign in");

    const area = areaOfPath(new URL(req.url).pathname);
    if (area && !areasForRole(user.role).includes(area)) {
      throw new ApiError(403, `Your role (${user.role.replace("_", " ")}) does not have access to ${area.replace("_", " ")}`);
    }
    return { via: "user", user };
  }

  throw new ApiError(401, "Missing API key. Send 'Authorization: Bearer <key>'.");
}
