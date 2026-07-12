import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";
import { ApiError, now } from "@/lib/util";

/** Revoke a key. Kept as a row (audit trail) but no longer usable. */
export const DELETE = route({ write: true }, async (_req, { params }) => {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("SELECT id, revoked_at FROM api_keys WHERE id = ?").get(id) as
    | { id: string; revoked_at: string }
    | undefined;
  if (!row) throw new ApiError(404, `API key not found: ${id}`);
  if (!row.revoked_at) db.prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ?").run(now(), id);
  return json({ data: { id, revoked: true } });
});
