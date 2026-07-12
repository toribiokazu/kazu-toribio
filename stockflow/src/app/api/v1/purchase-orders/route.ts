import { getDb, nextNumber, tx } from "@/lib/db";
import { emitEvent } from "@/lib/events";
import { json, route } from "@/lib/api";
import { ApiError, id as makeId, now, pagination, today, validate } from "@/lib/util";
import { orderWithLines, parseLines } from "@/lib/orders";

export const GET = route({ write: false }, (req) => {
  const db = getDb();
  const url = new URL(req.url);
  const { limit, offset } = pagination(url);
  const where: string[] = [];
  const params: string[] = [];
  const status = url.searchParams.get("status");
  if (status) {
    where.push("o.status = ?");
    params.push(status);
  }
  const vendorId = url.searchParams.get("vendor_id");
  if (vendorId) {
    where.push("o.vendor_id = ?");
    params.push(vendorId);
  }
  const q = url.searchParams.get("q");
  if (q) {
    where.push("(o.number LIKE ? OR v.name LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT o.*, v.name AS vendor_name, l.name AS location_name,
              (SELECT COALESCE(SUM(qty * unit_cost), 0) FROM purchase_order_lines WHERE order_id = o.id) AS total,
              (SELECT COUNT(*) FROM purchase_order_lines WHERE order_id = o.id) AS line_count
       FROM purchase_orders o
       JOIN vendors v ON v.id = o.vendor_id
       JOIN locations l ON l.id = o.location_id
       ${whereSql} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM purchase_orders o JOIN vendors v ON v.id = o.vendor_id ${whereSql}`)
      .get(...params) as { n: number }
  ).n;
  return json({ data: rows, total, limit, offset });
});

export const POST = route({ write: true }, async (req) => {
  const raw = (await req.json()) as Record<string, unknown>;
  const body = validate(raw, {
    vendor_id: { type: "string", required: true },
    location_id: { type: "string", required: true },
    order_date: { type: "string" },
    expected_date: { type: "string" },
    notes: { type: "string" },
  });
  const lines = parseLines(raw.lines);
  const db = getDb();
  if (!db.prepare("SELECT id FROM vendors WHERE id = ?").get(body.vendor_id as string))
    throw new ApiError(404, `Vendor not found: ${body.vendor_id}`);
  if (!db.prepare("SELECT id FROM locations WHERE id = ?").get(body.location_id as string))
    throw new ApiError(404, `Location not found: ${body.location_id}`);

  const orderId = makeId("po");
  tx((dbTx) => {
    const number = `PO-${nextNumber(dbTx, "purchase_order")}`;
    const ts = now();
    dbTx
      .prepare(
        "INSERT INTO purchase_orders (id, number, vendor_id, location_id, status, order_date, expected_date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)"
      )
      .run(
        orderId,
        number,
        body.vendor_id as string,
        body.location_id as string,
        (body.order_date as string) || today(),
        (body.expected_date as string) || "",
        (body.notes as string) || "",
        ts,
        ts
      );
    const insertLine = dbTx.prepare(
      "INSERT INTO purchase_order_lines (id, order_id, item_id, description, qty, qty_received, unit_cost) VALUES (?, ?, ?, ?, ?, 0, ?)"
    );
    for (const line of lines) {
      const item = dbTx.prepare("SELECT id, cost FROM items WHERE id = ?").get(line.item_id) as
        | { id: string; cost: number }
        | undefined;
      if (!item) throw new ApiError(404, `Item not found: ${line.item_id}`);
      insertLine.run(
        makeId("pol"),
        orderId,
        line.item_id,
        line.description || "",
        line.qty,
        line.unit_cost ?? item.cost
      );
    }
  });
  const order = orderWithLines("purchase", orderId);
  emitEvent("purchase_order.created", "purchase_order", orderId, order);
  return json({ data: order }, 201);
});
