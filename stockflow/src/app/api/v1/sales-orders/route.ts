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
  const customerId = url.searchParams.get("customer_id");
  if (customerId) {
    where.push("o.customer_id = ?");
    params.push(customerId);
  }
  const q = url.searchParams.get("q");
  if (q) {
    where.push("(o.number LIKE ? OR c.name LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT o.*, c.name AS customer_name, l.name AS location_name,
              (SELECT COALESCE(SUM(qty * unit_price), 0) FROM sales_order_lines WHERE order_id = o.id) AS total,
              (SELECT COUNT(*) FROM sales_order_lines WHERE order_id = o.id) AS line_count
       FROM sales_orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN locations l ON l.id = o.location_id
       ${whereSql} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM sales_orders o JOIN customers c ON c.id = o.customer_id ${whereSql}`)
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
    due_date: { type: "string" },
    notes: { type: "string" },
  });
  const lines = parseLines(raw.lines);
  const db = getDb();
  if (!db.prepare("SELECT id FROM customers WHERE id = ?").get(body.customer_id as string))
    throw new ApiError(404, `Customer not found: ${body.customer_id}`);
  if (!db.prepare("SELECT id FROM locations WHERE id = ?").get(body.location_id as string))
    throw new ApiError(404, `Location not found: ${body.location_id}`);

  const orderId = makeId("so");
  tx((dbTx) => {
    const number = `SO-${nextNumber(dbTx, "sales_order")}`;
    const ts = now();
    dbTx
      .prepare(
        "INSERT INTO sales_orders (id, number, customer_id, location_id, status, order_date, due_date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)"
      )
      .run(
        orderId,
        number,
        body.customer_id as string,
        body.location_id as string,
        (body.order_date as string) || today(),
        (body.due_date as string) || "",
        (body.notes as string) || "",
        ts,
        ts
      );
    const insertLine = dbTx.prepare(
      "INSERT INTO sales_order_lines (id, order_id, item_id, description, qty, qty_fulfilled, unit_price) VALUES (?, ?, ?, ?, ?, 0, ?)"
    );
    for (const line of lines) {
      const item = dbTx.prepare("SELECT id, price FROM items WHERE id = ?").get(line.item_id) as
        | { id: string; price: number }
        | undefined;
      if (!item) throw new ApiError(404, `Item not found: ${line.item_id}`);
      insertLine.run(
        makeId("sol"),
        orderId,
        line.item_id,
        line.description || "",
        line.qty,
        line.unit_price ?? item.price
      );
    }
  });
  const order = orderWithLines("sales", orderId);
  emitEvent("sales_order.created", "sales_order", orderId, order);
  return json({ data: order }, 201);
});
