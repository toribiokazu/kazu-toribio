import { getDb, nextNumber, tx } from "@/lib/db";
import { emitEvent } from "@/lib/events";
import { json, route } from "@/lib/api";
import { ApiError, id as makeId, now, pagination, today, validate } from "@/lib/util";
import { invoiceWithLines } from "@/lib/invoices";
import { orderWithLines } from "@/lib/orders";

export const GET = route({ write: false }, (req) => {
  const db = getDb();
  const url = new URL(req.url);
  const { limit, offset } = pagination(url);
  const where: string[] = [];
  const params: string[] = [];
  const status = url.searchParams.get("status");
  if (status) {
    where.push("inv.status = ?");
    params.push(status);
  }
  const q = url.searchParams.get("q");
  if (q) {
    where.push("(inv.number LIKE ? OR c.name LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT inv.*, c.name AS customer_name, o.number AS order_number,
              (SELECT COALESCE(SUM(qty * unit_price), 0) FROM invoice_lines WHERE invoice_id = inv.id) AS total
       FROM invoices inv
       JOIN customers c ON c.id = inv.customer_id
       JOIN sales_orders o ON o.id = inv.sales_order_id
       ${whereSql} ORDER BY inv.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM invoices inv JOIN customers c ON c.id = inv.customer_id ${whereSql}`)
      .get(...params) as { n: number }
  ).n;
  return json({ data: rows, total, limit, offset });
});

/** Create an invoice from a sales order (snapshots the order's lines). */
export const POST = route({ write: true }, async (req) => {
  const body = validate(await req.json(), {
    sales_order_id: { type: "string", required: true },
    due_date: { type: "string" },
    notes: { type: "string" },
  });
  const order = orderWithLines("sales", body.sales_order_id as string) as {
    id: string;
    status: string;
    customer_id: string;
    lines: { item_id: string; sku: string; item_name: string; description: string; qty: number; unit_price: number }[];
  };
  if (order.status === "canceled") throw new ApiError(422, "Cannot invoice a canceled order");
  const db = getDb();
  const existing = db
    .prepare("SELECT id, number FROM invoices WHERE sales_order_id = ? AND status != 'void'")
    .get(order.id) as { id: string; number: string } | undefined;
  if (existing)
    throw new ApiError(409, `Order already has invoice ${existing.number}; void it before re-invoicing`);

  const invoiceId = makeId("inv");
  tx((dbTx) => {
    const number = `INV-${nextNumber(dbTx, "invoice")}`;
    const ts = now();
    dbTx
      .prepare(
        "INSERT INTO invoices (id, number, sales_order_id, customer_id, status, issue_date, due_date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)"
      )
      .run(
        invoiceId,
        number,
        order.id,
        order.customer_id,
        today(),
        (body.due_date as string) || "",
        (body.notes as string) || "",
        ts,
        ts
      );
    const insert = dbTx.prepare(
      "INSERT INTO invoice_lines (id, invoice_id, item_id, sku, description, qty, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    for (const line of order.lines) {
      insert.run(
        makeId("invl"),
        invoiceId,
        line.item_id,
        line.sku,
        line.description || line.item_name,
        line.qty,
        line.unit_price
      );
    }
  });
  const invoice = invoiceWithLines(invoiceId);
  emitEvent("invoice.created", "invoice", invoiceId, invoice);
  return json({ data: invoice }, 201);
});
