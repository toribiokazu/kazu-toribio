import type { DatabaseSync } from "node:sqlite";
import { emitEvent } from "./events";
import { ApiError, id, now } from "./util";

/**
 * Apply a stock movement inside an existing transaction.
 * Records the movement in stock_moves and keeps the stock table in sync.
 * Throws 422 if the move would drive on-hand quantity negative.
 */
export function moveStock(
  db: DatabaseSync,
  args: {
    itemId: string;
    locationId: string;
    delta: number;
    reason: string;
    refType?: string;
    refId?: string;
    note?: string;
  }
): number {
  const item = db.prepare("SELECT id, type, name, sku, reorder_point FROM items WHERE id = ?").get(args.itemId) as
    | { id: string; type: string; name: string; sku: string; reorder_point: number }
    | undefined;
  if (!item) throw new ApiError(404, `Item not found: ${args.itemId}`);
  if (item.type !== "inventory")
    throw new ApiError(422, `Item ${item.sku} is not an inventory-type item`);
  const location = db.prepare("SELECT id FROM locations WHERE id = ?").get(args.locationId);
  if (!location) throw new ApiError(404, `Location not found: ${args.locationId}`);

  db.prepare(
    `INSERT INTO stock (item_id, location_id, qty) VALUES (?, ?, ?)
     ON CONFLICT(item_id, location_id) DO UPDATE SET qty = qty + excluded.qty`
  ).run(args.itemId, args.locationId, args.delta);

  const row = db
    .prepare("SELECT qty FROM stock WHERE item_id = ? AND location_id = ?")
    .get(args.itemId, args.locationId) as { qty: number };
  if (row.qty < 0)
    throw new ApiError(
      422,
      `Insufficient stock for ${item.sku}: on hand ${row.qty - args.delta}, requested ${-args.delta}`
    );

  db.prepare(
    "INSERT INTO stock_moves (id, item_id, location_id, delta, reason, ref_type, ref_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id("mov"),
    args.itemId,
    args.locationId,
    args.delta,
    args.reason,
    args.refType ?? "",
    args.refId ?? "",
    args.note ?? "",
    now()
  );
  return row.qty;
}

/** Total on-hand across locations; emits stock.low when it crosses the reorder point. */
export function checkLowStock(db: DatabaseSync, itemId: string): void {
  const item = db
    .prepare(
      `SELECT i.id, i.sku, i.name, i.reorder_point, COALESCE(SUM(s.qty), 0) AS on_hand
       FROM items i LEFT JOIN stock s ON s.item_id = i.id
       WHERE i.id = ? GROUP BY i.id`
    )
    .get(itemId) as
    | { id: string; sku: string; name: string; reorder_point: number; on_hand: number }
    | undefined;
  if (!item || item.reorder_point <= 0) return;
  if (item.on_hand <= item.reorder_point) {
    emitEvent("stock.low", "item", item.id, {
      item_id: item.id,
      sku: item.sku,
      name: item.name,
      on_hand: item.on_hand,
      reorder_point: item.reorder_point,
    });
  }
}
