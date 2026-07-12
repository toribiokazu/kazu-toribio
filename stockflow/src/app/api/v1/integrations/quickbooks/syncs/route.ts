import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";
import { pagination } from "@/lib/util";

export const GET = route({ write: true }, (req) => {
  const db = getDb();
  const url = new URL(req.url);
  const { limit, offset } = pagination(url);
  const where: string[] = ["provider = 'quickbooks'"];
  const params: string[] = [];
  const status = url.searchParams.get("status");
  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const rows = db
    .prepare(
      `SELECT id, event_type, entity_type, entity_id, action, status, detail, created_at
       FROM integration_syncs ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM integration_syncs ${whereSql}`).get(...params) as { n: number }
  ).n;
  return json({ data: rows, total, limit, offset });
});
