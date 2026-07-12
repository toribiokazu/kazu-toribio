import { getDb, nextNumber, tx } from "@/lib/db";
import { emitEvent } from "@/lib/events";
import { json, route } from "@/lib/api";
import { ApiError, id as makeId, now, pagination, validate } from "@/lib/util";
import { workOrderDetail } from "@/lib/manufacturing";

export const GET = route({ write: false }, (req) => {
  const db = getDb();
  const url = new URL(req.url);
  const { limit, offset } = pagination(url);
  const where: string[] = [];
  const params: string[] = [];
  const status = url.searchParams.get("status");
  if (status) {
    where.push("w.status = ?");
    params.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT w.*, b.name AS bom_name, i.sku AS output_sku, i.name AS output_item_name, l.name AS location_name
       FROM work_orders w
       JOIN boms b ON b.id = w.bom_id
       JOIN items i ON i.id = b.output_item_id
       JOIN locations l ON l.id = w.location_id
       ${whereSql} ORDER BY w.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM work_orders w ${whereSql}`).get(...params) as { n: number }
  ).n;
  return json({ data: rows, total, limit, offset });
});

export const POST = route({ write: true }, async (req) => {
  const body = validate(await req.json(), {
    bom_id: { type: "string", required: true },
    location_id: { type: "string", required: true },
    qty: { type: "number", min: 0 },
    notes: { type: "string" },
  });
  const db = getDb();
  if (!db.prepare("SELECT id FROM boms WHERE id = ?").get(body.bom_id as string))
    throw new ApiError(404, `BOM not found: ${body.bom_id}`);
  if (!db.prepare("SELECT id FROM locations WHERE id = ?").get(body.location_id as string))
    throw new ApiError(404, `Location not found: ${body.location_id}`);
  const woId = makeId("wo");
  tx((dbTx) => {
    const number = `WO-${nextNumber(dbTx, "work_order")}`;
    const ts = now();
    dbTx
      .prepare(
        "INSERT INTO work_orders (id, number, bom_id, location_id, qty, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)"
      )
      .run(woId, number, body.bom_id as string, body.location_id as string, (body.qty as number) || 1, (body.notes as string) || "", ts, ts);
  });
  const wo = workOrderDetail(woId);
  emitEvent("work_order.created", "work_order", woId, wo);
  return json({ data: wo }, 201);
});
