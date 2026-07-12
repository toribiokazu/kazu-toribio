import { getDb } from "@/lib/db";
import { emitEvent } from "@/lib/events";
import { json, route } from "@/lib/api";
import { ApiError, now, validate } from "@/lib/util";
import { workOrderDetail } from "@/lib/manufacturing";

export const GET = route({ write: false }, async (_req, { params }) => {
  const { id } = await params;
  return json({ data: workOrderDetail(id) });
});

export const PATCH = route({ write: true }, async (req, { params }) => {
  const { id } = await params;
  const existing = workOrderDetail(id) as { status: string };
  const body = validate(await req.json(), {
    notes: { type: "string" },
    qty: { type: "number", min: 0 },
    status: { type: "string", enum: ["open", "in_progress", "canceled"] },
  });
  if (existing.status === "completed") throw new ApiError(422, "Completed work orders cannot be changed");
  const keys = Object.keys(body);
  if (keys.length) {
    getDb()
      .prepare(`UPDATE work_orders SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`)
      .run(...keys.map((k) => body[k] as string | number), now(), id);
  }
  const wo = workOrderDetail(id);
  emitEvent("work_order.updated", "work_order", id, wo);
  return json({ data: wo });
});

export const DELETE = route({ write: true }, async (_req, { params }) => {
  const { id } = await params;
  const wo = workOrderDetail(id) as { status: string };
  if (wo.status === "completed") throw new ApiError(422, "Completed work orders cannot be deleted");
  getDb().prepare("DELETE FROM work_orders WHERE id = ?").run(id);
  return json({ data: { id, deleted: true } });
});
