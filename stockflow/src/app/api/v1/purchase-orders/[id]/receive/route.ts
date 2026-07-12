import { tx } from "@/lib/db";
import { emitEvent } from "@/lib/events";
import { json, route } from "@/lib/api";
import { ApiError } from "@/lib/util";
import { orderWithLines, refreshOrderStatus } from "@/lib/orders";
import { moveStock } from "@/lib/stock";

type ReceiveLine = { line_id: string; qty: number };

/**
 * Receive items on a purchase order into the order's location.
 *   {}                                  → receive all remaining quantities
 *   { lines: [{ line_id, qty }] }       → partial receipt
 */
export const POST = route({ write: true }, async (req, { params }) => {
  const { id } = await params;
  const order = orderWithLines("purchase", id) as {
    id: string;
    status: string;
    location_id: string;
    lines: { id: string; item_id: string; qty: number; qty_received: number; sku: string }[];
  };
  if (order.status === "canceled") throw new ApiError(422, "Order is canceled");
  if (order.status === "received") throw new ApiError(422, "Order is already fully received");

  let requested: ReceiveLine[];
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
      .filter((l) => l.qty - l.qty_received > 0)
      .map((l) => ({ line_id: l.id, qty: l.qty - l.qty_received }));
  }
  if (requested.length === 0) throw new ApiError(422, "Nothing left to receive");

  tx((db) => {
    for (const reqLine of requested) {
      const line = order.lines.find((l) => l.id === reqLine.line_id);
      if (!line) throw new ApiError(404, `Order line not found: ${reqLine.line_id}`);
      const remaining = line.qty - line.qty_received;
      if (reqLine.qty > remaining)
        throw new ApiError(422, `Line ${line.sku}: requested ${reqLine.qty} exceeds remaining ${remaining}`);
      moveStock(db, {
        itemId: line.item_id,
        locationId: order.location_id,
        delta: reqLine.qty,
        reason: "purchase",
        refType: "purchase_order",
        refId: order.id,
      });
      db.prepare("UPDATE purchase_order_lines SET qty_received = qty_received + ? WHERE id = ?").run(
        reqLine.qty,
        reqLine.line_id
      );
    }
    refreshOrderStatus(db, "purchase", id);
  });

  const updated = orderWithLines("purchase", id) as { status: string };
  emitEvent(
    updated.status === "received" ? "purchase_order.received" : "purchase_order.updated",
    "purchase_order",
    id,
    updated
  );
  return json({ data: updated });
});
