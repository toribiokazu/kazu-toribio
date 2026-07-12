import { getDb } from "@/lib/db";
import { emitEvent } from "@/lib/events";
import { json, route } from "@/lib/api";
import { ApiError, now, validate } from "@/lib/util";
import { estimateWithLines } from "@/lib/estimates";

export const GET = route({ write: false }, async (_req, { params }) => {
  const { id } = await params;
  return json({ data: estimateWithLines(id) });
});

export const PATCH = route({ write: true }, async (req, { params }) => {
  const { id } = await params;
  const existing = estimateWithLines(id) as { status: string };
  const body = validate(await req.json(), {
    expiry_date: { type: "string" },
    notes: { type: "string" },
    status: { type: "string", enum: ["declined", "open"] },
  });
  if (body.status !== undefined) {
    if (existing.status === "accepted") throw new ApiError(422, "Accepted estimates cannot be changed");
    if (body.status === "declined" && existing.status !== "open")
      throw new ApiError(422, "Only open estimates can be declined");
  }
  const db = getDb();
  const keys = Object.keys(body);
  if (keys.length) {
    db.prepare(`UPDATE estimates SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`).run(
      ...keys.map((k) => body[k] as string),
      now(),
      id
    );
    if (body.status === "declined") db.prepare("UPDATE estimates SET decided_at = ? WHERE id = ?").run(now(), id);
    if (body.status === "open") db.prepare("UPDATE estimates SET decided_at = '' WHERE id = ?").run(id);
  }
  const estimate = estimateWithLines(id);
  emitEvent(body.status === "declined" ? "estimate.declined" : "estimate.updated", "estimate", id, estimate);
  return json({ data: estimate });
});

export const DELETE = route({ write: true }, async (_req, { params }) => {
  const { id } = await params;
  const estimate = estimateWithLines(id) as { status: string };
  if (estimate.status === "accepted")
    throw new ApiError(422, "Accepted estimates are linked to a sales order and cannot be deleted");
  const db = getDb();
  db.prepare("DELETE FROM estimate_lines WHERE estimate_id = ?").run(id);
  db.prepare("DELETE FROM estimates WHERE id = ?").run(id);
  emitEvent("estimate.deleted", "estimate", id, { id, deleted: true });
  return json({ data: { id, deleted: true } });
});
