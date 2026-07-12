import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";

/** Stock levels per item per location, plus totals. */
export const GET = route({ write: false }, (req) => {
  const db = getDb();
  const url = new URL(req.url);
  const where: string[] = ["i.type = 'inventory'"];
  const params: string[] = [];
  const itemId = url.searchParams.get("item_id");
  if (itemId) {
    where.push("i.id = ?");
    params.push(itemId);
  }
  const locationId = url.searchParams.get("location_id");
  if (locationId) {
    where.push("s.location_id = ?");
    params.push(locationId);
  }
  const rows = db
    .prepare(
      `SELECT s.item_id, i.sku, i.name AS item_name, i.uom, i.cost, i.reorder_point,
              s.location_id, l.name AS location_name, s.qty
       FROM stock s
       JOIN items i ON i.id = s.item_id
       JOIN locations l ON l.id = s.location_id
       WHERE ${where.join(" AND ")}
       ORDER BY i.sku, l.name`
    )
    .all(...params);
  return json({ data: rows });
});
