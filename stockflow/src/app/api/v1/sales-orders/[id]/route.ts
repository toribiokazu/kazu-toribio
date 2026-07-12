import { getDb } from "@/lib/db";
import { emitEvent } from "@/lib/events";
import { json, route } from "@/lib/api";
import { ApiError, now, validate } from "@/lib/util";
import { orderWithLines } from "@/lib/orders";

export const GET = route({ write: false }, async (_req, { params }) => {
  const { id } = await params;
  return json({ data: orderWithLines("sales", id) });
});

export const PATCH = route({ write: true }, async (req, { params }) => {
  const { id } = await params;
  const existing = orderWithLines("sales", id) as { status: string };
  const body = validate(await req.json(), {
    due_date: { type: "string" },
    notes: { type: "string" },
    status: { type: "string", enum: ["canceled"] },
  });
  if (body.status === "canceled" && existing.status !== "open")
    throw new ApiError(422, "Only open orders can be canceled");
  const keys = Object.keys(body);
  if (keys.length) {
    getDb()
      .prepare(`UPDATE sales_orders SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`)
      .run(...keys.map((k) => body[k] as string), now(), id);
  }
  const order = orderWithLines("sales", id);
  emitEvent(
    body.status === "canceled" ? "sales_order.canceled" : "sales_order.updated",
    "sales_order",
    id,
    order
  );
  return json({ data: order });
});

export const DELETE = route({ write: true }, async (_req, { params }) => {
  const { id } = await params;
  const order = orderWithLines("sales", id) as { status: string };
  if (order.status !== "open" && order.status !== "canceled")
    throw new ApiError(422, "Orders with shipments cannot be deleted; cancel remaining quantity instead");
  const db = getDb();
  db.prepare("DELETE FROM sales_order_lines WHERE order_id = ?").run(id);
  db.prepare("DELETE FROM sales_orders WHERE id = ?").run(id);
  emitEvent("sales_order.canceled", "sales_order", id, { id, deleted: true });
  return json({ data: { id, deleted: true } });
});
