import { tx } from "@/lib/db";
import { emitEvent } from "@/lib/events";
import { json, route } from "@/lib/api";
import { ApiError } from "@/lib/util";
import { orderWithLines, refreshOrderStatus } from "@/lib/orders";
import { checkLowStock, moveStock } from "@/lib/stock";

type FulfillLine = { line_id: string; qty: number };

/**
 * Ship items on a sales order. Body is optional:
 *   {}                                  → fulfill all remaining quantities
 *   { lines: [{ line_id, qty }] }       → partial fulfillment
 * Stock is deducted from the order's location.
 */
export const POST = route({ write: true }, async (req, { params }) => {
  const { id } = await params;
  const order = orderWithLines("sales", id) as {
    id: string;
    status: string;
    location_id: string;
    lines: { id: string; item_id: string; qty: number; qty_fulfilled: number; sku: string }[];
  };
  if (order.status === "canceled") throw new ApiError(422, "Order is canceled");
  if (order.status === "fulfilled") throw new ApiError(422, "Order is already fully fulfilled");

  let requested: FulfillLine[];
  const raw = (await req.json().catch(() => ({}))) as { lines?: unknown };
  if (Array.isArray(raw.lines)) {
    requested = raw.lines.map((l, i) => {
      const line = l as Record<string, unknown>;
      if (typeof line.line_id !== "string") throw new ApiError(400, `lines[${i}].line_id is required`);
      if (typeof line.qty !== "number" || line.qty <= 0)
        throw new ApiError(400, `lines[${i}].qty must be positive`);
      return { line_id: line.line_id, qty: line.qty };
    });
  } else {
    requested = order.lines
      .filter((l) => l.qty - l.qty_fulfilled > 0)
      .map((l) => ({ line_id: l.id, qty: l.qty - l.qty_fulfilled }));
  }
  if (requested.length === 0) throw new ApiError(422, "Nothing left to fulfill");

  const touchedItems = new Set<string>();
  tx((db) => {
    for (const reqLine of requested) {
      const line = order.lines.find((l) => l.id === reqLine.line_id);
      if (!line) throw new ApiError(404, `Order line not found: ${reqLine.line_id}`);
      const remaining = line.qty - line.qty_fulfilled;
      if (reqLine.qty > remaining)
        throw new ApiError(422, `Line ${line.sku}: requested ${reqLine.qty} exceeds remaining ${remaining}`);
      moveStock(db, {
        itemId: line.item_id,
        locationId: order.location_id,
        delta: -reqLine.qty,
        reason: "sale",
        refType: "sales_order",
        refId: order.id,
      });
      db.prepare("UPDATE sales_order_lines SET qty_fulfilled = qty_fulfilled + ? WHERE id = ?").run(
        reqLine.qty,
        reqLine.line_id
      );
      touchedItems.add(line.item_id);
    }
    refreshOrderStatus(db, "sales", id);
    for (const itemId of touchedItems) checkLowStock(db, itemId);
  });

  const updated = orderWithLines("sales", id) as { status: string };
  emitEvent(
    updated.status === "fulfilled" ? "sales_order.fulfilled" : "sales_order.updated",
    "sales_order",
    id,
    updated
  );
  return json({ data: updated });
});
