import { getDb } from "@/lib/db";
import { emitEvent } from "@/lib/events";
import { json, route } from "@/lib/api";
import { ApiError, now, validate } from "@/lib/util";
import { bomWithLines } from "@/lib/manufacturing";

export const GET = route({ write: false }, async (_req, { params }) => {
  const { id } = await params;
  return json({ data: bomWithLines(id) });
});

export const PATCH = route({ write: true }, async (req, { params }) => {
  const { id } = await params;
  bomWithLines(id);
  const body = validate(await req.json(), {
    name: { type: "string" },
    notes: { type: "string" },
    output_qty: { type: "number", min: 0 },
  });
  const keys = Object.keys(body);
  if (keys.length) {
    getDb()
      .prepare(`UPDATE boms SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`)
      .run(...keys.map((k) => body[k] as string | number), now(), id);
  }
  const bom = bomWithLines(id);
  emitEvent("bom.updated", "bom", id, bom);
  return json({ data: bom });
});

export const DELETE = route({ write: true }, async (_req, { params }) => {
  const { id } = await params;
  bomWithLines(id);
  const db = getDb();
  const used = db.prepare("SELECT COUNT(*) AS n FROM work_orders WHERE bom_id = ?").get(id) as { n: number };
  if (used.n > 0) throw new ApiError(409, "BOM is referenced by work orders and cannot be deleted");
  db.prepare("DELETE FROM bom_lines WHERE bom_id = ?").run(id);
  db.prepare("DELETE FROM boms WHERE id = ?").run(id);
  return json({ data: { id, deleted: true } });
});
