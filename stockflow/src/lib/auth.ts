import crypto from "node:crypto";
import { getDb } from "./db";
import { gatePassword, hasValidSession } from "./session";
import { ApiError, id, now } from "./util";

export type Auth = { via: "api_key"; keyId: string; scope: "full" | "read" } | { via: "ui" };

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
 * Authenticate a request to /api/v1.
 *
 * - `Authorization: Bearer sfk_...` validates against stored API keys.
 * - Same-origin browser requests from the StockFlow UI (Sec-Fetch-Site:
 *   same-origin) are allowed without a key, so the UI itself runs on the
 *   public API. External callers always need a key.
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
    if (write && row.scope !== "full")
      throw new ApiError(403, "This API key is read-only");
    db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(now(), row.id);
    return { via: "api_key", keyId: row.id, scope: row.scope };
  }

  if (req.headers.get("sec-fetch-site") === "same-origin") {
    // When the password gate is enabled, browser requests must also carry
    // a valid session cookie; without a gate the same-origin check stands alone.
    if (!gatePassword() || hasValidSession(req.headers.get("cookie"))) return { via: "ui" };
    throw new ApiError(401, "Session expired — reload the page and sign in again");
  }

  throw new ApiError(401, "Missing API key. Send 'Authorization: Bearer <key>'.");
}
