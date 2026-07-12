import { getDb, nextNumber, tx } from "@/lib/db";
import { emitEvent } from "@/lib/events";
import { json, route } from "@/lib/api";
import { ApiError, id as makeId, now, pagination, today, validate } from "@/lib/util";
import { parseLines } from "@/lib/orders";
import { estimateWithLines } from "@/lib/estimates";

export const GET = route({ write: false }, (req) => {
  const db = getDb();
  const url = new URL(req.url);
  const { limit, offset } = pagination(url);
  const where: string[] = [];
  const params: string[] = [];
  const status = url.searchParams.get("status");
  if (status) {
    where.push("e.status = ?");
    params.push(status);
  }
  const q = url.searchParams.get("q");
  if (q) {
    where.push("(e.number LIKE ? OR c.name LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT e.*, c.name AS customer_name, l.name AS location_name,
              (SELECT COALESCE(SUM(qty * unit_price), 0) FROM estimate_lines WHERE estimate_id = e.id) AS total,
              (SELECT COUNT(*) FROM estimate_lines WHERE estimate_id = e.id) AS line_count
       FROM estimates e
       JOIN customers c ON c.id = e.customer_id
       JOIN locations l ON l.id = e.location_id
       ${whereSql} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM estimates e JOIN customers c ON c.id = e.customer_id ${whereSql}`)
      .get(...params) as { n: number }
  ).n;
  return json({ data: rows, total, limit, offset });
});

export const POST = route({ write: true }, async (req) => {
  const raw = (await req.json()) as Record<string, unknown>;
  const body = validate(raw, {
    customer_id: { type: "string", required: true },
    location_id: { type: "string", required: true },
    order_date: { type: "string" },
    expiry_date: { type: "string" },
    notes: { type: "string" },
  });
  const lines = parseLines(raw.lines);
  const db = getDb();
  if (!db.prepare("SELECT id FROM customers WHERE id = ?").get(body.customer_id as string))
    throw new ApiError(404, `Customer not found: ${body.customer_id}`);
  if (!db.prepare("SELECT id FROM locations WHERE id = ?").get(body.location_id as string))
    throw new ApiError(404, `Location not found: ${body.location_id}`);

  const estimateId = makeId("est");
  tx((dbTx) => {
    const number = `EST-${nextNumber(dbTx, "estimate")}`;
    const ts = now();
    dbTx
      .prepare(
        "INSERT INTO estimates (id, number, customer_id, location_id, status, order_date, expiry_date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)"
      )
      .run(
        estimateId,
        number,
        body.customer_id as string,
        body.location_id as string,
        (body.order_date as string) || today(),
        (body.expiry_date as string) || "",
        (body.notes as string) || "",
        ts,
        ts
      );
    const insert = dbTx.prepare(
      "INSERT INTO estimate_lines (id, estimate_id, item_id, description, qty, unit_price) VALUES (?, ?, ?, ?, ?, ?)"
    );
    for (const line of lines) {
      const item = dbTx.prepare("SELECT id, price FROM items WHERE id = ?").get(line.item_id) as
        | { id: string; price: number }
        | undefined;
      if (!item) throw new ApiError(404, `Item not found: ${line.item_id}`);
      insert.run(makeId("estl"), estimateId, line.item_id, line.description || "", line.qty, line.unit_price ?? item.price);
    }
  });
  const estimate = estimateWithLines(estimateId);
  emitEvent("estimate.created", "estimate", estimateId, estimate);
  return json({ data: estimate }, 201);
});
