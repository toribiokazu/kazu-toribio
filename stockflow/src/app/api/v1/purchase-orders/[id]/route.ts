import { getDb } from "@/lib/db";
import { emitEvent } from "@/lib/events";
import { json, route } from "@/lib/api";
import { ApiError, now, validate } from "@/lib/util";
import { orderWithLines } from "@/lib/orders";

export const GET = route({ write: false }, async (_req, { params }) => {
  const { id } = await params;
  return json({ data: orderWithLines("purchase", id) });
});

export const PATCH = route({ write: true }, async (req, { params }) => {
  const { id } = await params;
  const existing = orderWithLines("purchase", id) as { status: string };
  const body = validate(await req.json(), {
    expected_date: { type: "string" },
    notes: { type: "string" },
    status: { type: "string", enum: ["canceled"] },
  });
  if (body.status === "canceled" && existing.status !== "open")
    throw new ApiError(422, "Only open orders can be canceled");
  const keys = Object.keys(body);
  if (keys.length) {
    getDb()
      .prepare(`UPDATE purchase_orders SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`)
      .run(...keys.map((k) => body[k] as string), now(), id);
  }
  const order = orderWithLines("purchase", id);
  emitEvent(
    body.status === "canceled" ? "purchase_order.canceled" : "purchase_order.updated",
    "purchase_order",
    id,
    order
  );
  return json({ data: order });
});

export const DELETE = route({ write: true }, async (_req, { params }) => {
  const { id } = await params;
  const order = orderWithLines("purchase", id) as { status: string };
  if (order.status !== "open" && order.status !== "canceled")
    throw new ApiError(422, "Orders with receipts cannot be deleted");
  const db = getDb();
  db.prepare("DELETE FROM purchase_order_lines WHERE order_id = ?").run(id);
  db.prepare("DELETE FROM purchase_orders WHERE id = ?").run(id);
  emitEvent("purchase_order.canceled", "purchase_order", id, { id, deleted: true });
  return json({ data: { id, deleted: true } });
});
