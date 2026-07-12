import { tx } from "@/lib/db";
import { emitEvent } from "@/lib/events";
import { json, route } from "@/lib/api";
import { ApiError, validate } from "@/lib/util";
import { moveStock } from "@/lib/stock";

/** Move quantity of an item from one location to another. */
export const POST = route({ write: true }, async (req) => {
  const body = validate(await req.json(), {
    item_id: { type: "string", required: true },
    from_location_id: { type: "string", required: true },
    to_location_id: { type: "string", required: true },
    qty: { type: "number", required: true, min: 0 },
    note: { type: "string" },
  });
  if (body.from_location_id === body.to_location_id)
    throw new ApiError(400, "from_location_id and to_location_id must differ");
  if ((body.qty as number) <= 0) throw new ApiError(400, "qty must be positive");
  tx((db) => {
    moveStock(db, {
      itemId: body.item_id as string,
      locationId: body.from_location_id as string,
      delta: -(body.qty as number),
      reason: "transfer_out",
      refType: "transfer",
      note: (body.note as string) || "",
    });
    moveStock(db, {
      itemId: body.item_id as string,
      locationId: body.to_location_id as string,
      delta: body.qty as number,
      reason: "transfer_in",
      refType: "transfer",
      note: (body.note as string) || "",
    });
  });
  const payload = {
    item_id: body.item_id,
    from_location_id: body.from_location_id,
    to_location_id: body.to_location_id,
    qty: body.qty,
    note: (body.note as string) || "",
  };
  emitEvent("stock.transferred", "item", body.item_id as string, payload);
  return json({ data: payload }, 201);
});
