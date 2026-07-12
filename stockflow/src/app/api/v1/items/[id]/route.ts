import { getDb } from "@/lib/db";
import { emitEvent } from "@/lib/events";
import { json, route } from "@/lib/api";
import { ApiError, now, validate } from "@/lib/util";
import { getOr404 } from "@/lib/resource";

const UPDATE_FIELDS = {
  sku: { type: "string" },
  name: { type: "string" },
  description: { type: "string" },
  type: { type: "string", enum: ["inventory", "non_inventory", "service"] },
  barcode: { type: "string" },
  category: { type: "string" },
  uom: { type: "string" },
  cost: { type: "number", min: 0 },
  price: { type: "number", min: 0 },
  reorder_point: { type: "number", min: 0 },
  active: { type: "boolean" },
} as const;

export const GET = route({ write: false }, async (_req, { params }) => {
  const { id } = await params;
  const item = getOr404("items", "item", id);
  const db = getDb();
  const stock = db
    .prepare(
      `SELECT s.location_id, l.name AS location_name, s.qty
       FROM stock s JOIN locations l ON l.id = s.location_id
       WHERE s.item_id = ? ORDER BY l.name`
    )
    .all(id);
  const onHand = (db
    .prepare("SELECT COALESCE(SUM(qty), 0) AS n FROM stock WHERE item_id = ?")
    .get(id) as { n: number }).n;
  const moves = db
    .prepare(
      `SELECT m.*, l.name AS location_name FROM stock_moves m
       JOIN locations l ON l.id = m.location_id
       WHERE m.item_id = ? ORDER BY m.created_at DESC LIMIT 50`
    )
    .all(id);
  return json({ data: { ...item, on_hand: onHand, stock, recent_moves: moves } });
});

export const PATCH = route({ write: true }, async (req, { params }) => {
  const { id } = await params;
  getOr404("items", "item", id);
  const body = validate(await req.json(), { ...UPDATE_FIELDS });
  const keys = Object.keys(body);
  if (keys.length) {
    const db = getDb();
    db.prepare(`UPDATE items SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`).run(
      ...keys.map((k) => (typeof body[k] === "boolean" ? (body[k] ? 1 : 0) : (body[k] as string | number))),
      now(),
      id
    );
  }
  const row = getOr404("items", "item", id);
  emitEvent("item.updated", "item", id, row);
  return json({ data: row });
});

export const DELETE = route({ write: true }, async (_req, { params }) => {
  const { id } = await params;
  const row = getOr404("items", "item", id);
  const db = getDb();
  const used = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM sales_order_lines WHERE item_id = ?) +
              (SELECT COUNT(*) FROM purchase_order_lines WHERE item_id = ?) +
              (SELECT COUNT(*) FROM bom_lines WHERE component_item_id = ?) +
              (SELECT COUNT(*) FROM boms WHERE output_item_id = ?) AS n`
    )
    .get(id, id, id, id) as { n: number };
  if (used.n > 0)
    throw new ApiError(409, "Item is referenced by orders or BOMs; deactivate it instead (PATCH active: false)");
  db.prepare("DELETE FROM stock_moves WHERE item_id = ?").run(id);
  db.prepare("DELETE FROM stock WHERE item_id = ?").run(id);
  db.prepare("DELETE FROM items WHERE id = ?").run(id);
  emitEvent("item.deleted", "item", id, row);
  return json({ data: { id, deleted: true } });
});
