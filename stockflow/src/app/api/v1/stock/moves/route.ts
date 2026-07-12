import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";
import { pagination } from "@/lib/util";

/** Movement history (every stock change, with reason and reference). */
export const GET = route({ write: false }, (req) => {
  const db = getDb();
  const url = new URL(req.url);
  const { limit, offset } = pagination(url);
  const where: string[] = [];
  const params: string[] = [];
  const itemId = url.searchParams.get("item_id");
  if (itemId) {
    where.push("m.item_id = ?");
    params.push(itemId);
  }
  const locationId = url.searchParams.get("location_id");
  if (locationId) {
    where.push("m.location_id = ?");
    params.push(locationId);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT m.*, i.sku, i.name AS item_name, l.name AS location_name
       FROM stock_moves m
       JOIN items i ON i.id = m.item_id
       JOIN locations l ON l.id = m.location_id
       ${whereSql} ORDER BY m.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM stock_moves m ${whereSql}`).get(...params) as { n: number }
  ).n;
  return json({ data: rows, total, limit, offset });
});
