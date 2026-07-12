import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";
import { ApiError, pagination } from "@/lib/util";

export const GET = route({ write: false }, async (req, { params }) => {
  const { id } = await params;
  const db = getDb();
  if (!db.prepare("SELECT id FROM webhooks WHERE id = ?").get(id))
    throw new ApiError(404, `Webhook not found: ${id}`);
  const { limit, offset } = pagination(new URL(req.url));
  const rows = db
    .prepare(
      "SELECT * FROM webhook_deliveries WHERE webhook_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
    )
    .all(id, limit, offset);
  const total = (
    db.prepare("SELECT COUNT(*) AS n FROM webhook_deliveries WHERE webhook_id = ?").get(id) as { n: number }
  ).n;
  return json({ data: rows, total, limit, offset });
});
