import { tx } from "@/lib/db";
import { emitEvent } from "@/lib/events";
import { json, route } from "@/lib/api";
import { validate } from "@/lib/util";
import { checkLowStock, moveStock } from "@/lib/stock";

/** Manual stock adjustment: positive delta adds, negative removes. */
export const POST = route({ write: true }, async (req) => {
  const body = validate(await req.json(), {
    item_id: { type: "string", required: true },
    location_id: { type: "string", required: true },
    delta: { type: "number", required: true },
    reason: { type: "string" },
    note: { type: "string" },
  });
  const newQty = tx((db) => {
    const qty = moveStock(db, {
      itemId: body.item_id as string,
      locationId: body.location_id as string,
      delta: body.delta as number,
      reason: (body.reason as string) || "adjustment",
      refType: "adjustment",
      note: (body.note as string) || "",
    });
    checkLowStock(db, body.item_id as string);
    return qty;
  });
  const payload = {
    item_id: body.item_id,
    location_id: body.location_id,
    delta: body.delta,
    new_qty: newQty,
    reason: (body.reason as string) || "adjustment",
    note: (body.note as string) || "",
  };
  emitEvent("stock.adjusted", "item", body.item_id as string, payload);
  return json({ data: payload }, 201);
});
