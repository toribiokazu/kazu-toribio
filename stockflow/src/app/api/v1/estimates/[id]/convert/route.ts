import { nextNumber, tx } from "@/lib/db";
import { emitEvent } from "@/lib/events";
import { json, route } from "@/lib/api";
import { ApiError, id as makeId, now, today } from "@/lib/util";
import { estimateWithLines } from "@/lib/estimates";
import { orderWithLines } from "@/lib/orders";

/**
 * Win the deal: mark the estimate accepted and create a sales order
 * from its lines. The new order starts open and is fulfilled as usual.
 */
export const POST = route({ write: true }, async (_req, { params }) => {
  const { id } = await params;
  const estimate = estimateWithLines(id) as {
    id: string;
    status: string;
    customer_id: string;
    location_id: string;
    notes: string;
    lines: { item_id: string; description: string; qty: number; unit_price: number }[];
  };
  if (estimate.status === "accepted") throw new ApiError(422, "Estimate was already accepted");
  if (estimate.status === "declined") throw new ApiError(422, "Estimate was declined — reopen it first (PATCH status: 'open')");

  const orderId = makeId("so");
  tx((db) => {
    const number = `SO-${nextNumber(db, "sales_order")}`;
    const ts = now();
    db.prepare(
      "INSERT INTO sales_orders (id, number, customer_id, location_id, status, order_date, due_date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, 'open', ?, '', ?, ?, ?)"
    ).run(orderId, number, estimate.customer_id, estimate.location_id, today(), estimate.notes, ts, ts);
    const insert = db.prepare(
      "INSERT INTO sales_order_lines (id, order_id, item_id, description, qty, qty_fulfilled, unit_price) VALUES (?, ?, ?, ?, ?, 0, ?)"
    );
    for (const line of estimate.lines) {
      insert.run(makeId("sol"), orderId, line.item_id, line.description, line.qty, line.unit_price);
    }
    db.prepare(
      "UPDATE estimates SET status = 'accepted', sales_order_id = ?, decided_at = ?, updated_at = ? WHERE id = ?"
    ).run(orderId, ts, ts, id);
  });

  const updated = estimateWithLines(id);
  const order = orderWithLines("sales", orderId);
  emitEvent("estimate.accepted", "estimate", id, { ...updated, sales_order: order });
  emitEvent("sales_order.created", "sales_order", orderId, order);
  return json({ data: { estimate: updated, sales_order: order } }, 201);
});
