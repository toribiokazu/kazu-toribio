import type { DatabaseSync } from "node:sqlite";
import { getDb } from "./db";
import { ApiError } from "./util";

export type OrderKind = "sales" | "purchase";

const TABLES = {
  sales: { order: "sales_orders", line: "sales_order_lines", done: "fulfilled", qtyDone: "qty_fulfilled", party: "customer_id", partyTable: "customers", priceCol: "unit_price" },
  purchase: { order: "purchase_orders", line: "purchase_order_lines", done: "received", qtyDone: "qty_received", party: "vendor_id", partyTable: "vendors", priceCol: "unit_cost" },
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function orderWithLines(kind: OrderKind, orderId: string): any {
  const t = TABLES[kind];
  const db = getDb();
  const order = db
    .prepare(
      `SELECT o.*, p.name AS ${kind === "sales" ? "customer_name" : "vendor_name"}, l.name AS location_name
       FROM ${t.order} o
       JOIN ${t.partyTable} p ON p.id = o.${t.party}
       JOIN locations l ON l.id = o.location_id
       WHERE o.id = ?`
    )
    .get(orderId) as Record<string, unknown> | undefined;
  if (!order) throw new ApiError(404, `Order not found: ${orderId}`);
  const lines = db
    .prepare(
      `SELECT ol.*, i.sku, i.name AS item_name, i.uom
       FROM ${t.line} ol JOIN items i ON i.id = ol.item_id
       WHERE ol.order_id = ? ORDER BY ol.rowid`
    )
    .all(orderId) as Record<string, unknown>[];
  const total = lines.reduce(
    (sum, l) => sum + (l.qty as number) * (l[t.priceCol] as number),
    0
  );
  return { ...order, lines, total };
}

/** Recompute open/partial/fulfilled|received from line quantities. Call inside a tx. */
export function refreshOrderStatus(db: DatabaseSync, kind: OrderKind, orderId: string): string {
  const t = TABLES[kind];
  const row = db
    .prepare(
      `SELECT SUM(qty) AS ordered, SUM(${t.qtyDone}) AS done FROM ${t.line} WHERE order_id = ?`
    )
    .get(orderId) as { ordered: number | null; done: number | null };
  const ordered = row.ordered ?? 0;
  const done = row.done ?? 0;
  const status = done <= 0 ? "open" : done >= ordered ? t.done : "partial";
  db.prepare(`UPDATE ${t.order} SET status = ?, updated_at = ? WHERE id = ? AND status != 'canceled'`).run(
    status,
    new Date().toISOString(),
    orderId
  );
  return status;
}

export type LineInput = { item_id: string; qty: number; unit_price?: number; unit_cost?: number; description?: string };

export function parseLines(input: unknown): LineInput[] {
  if (!Array.isArray(input) || input.length === 0)
    throw new ApiError(400, "Field 'lines' must be a non-empty array");
  return input.map((raw, i) => {
    if (typeof raw !== "object" || raw === null) throw new ApiError(400, `lines[${i}] must be an object`);
    const line = raw as Record<string, unknown>;
    if (typeof line.item_id !== "string" || !line.item_id)
      throw new ApiError(400, `lines[${i}].item_id is required`);
    if (typeof line.qty !== "number" || line.qty <= 0)
      throw new ApiError(400, `lines[${i}].qty must be a positive number`);
    for (const priceKey of ["unit_price", "unit_cost"] as const) {
      const v = line[priceKey];
      if (v !== undefined && (typeof v !== "number" || v < 0))
        throw new ApiError(400, `lines[${i}].${priceKey} must be a non-negative number`);
    }
    return {
      item_id: line.item_id,
      qty: line.qty,
      unit_price: line.unit_price as number | undefined,
      unit_cost: line.unit_cost as number | undefined,
      description: typeof line.description === "string" ? line.description : "",
    };
  });
}
