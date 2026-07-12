import { getDb } from "@/lib/db";
import { route } from "@/lib/api";
import { today } from "@/lib/util";

const JSON_TABLES = [
  "items",
  "locations",
  "stock",
  "stock_moves",
  "customers",
  "vendors",
  "estimates",
  "estimate_lines",
  "sales_orders",
  "sales_order_lines",
  "invoices",
  "invoice_lines",
  "purchase_orders",
  "purchase_order_lines",
  "boms",
  "bom_lines",
  "work_orders",
  "events",
];

const CSV_QUERIES: Record<string, string> = {
  items: `SELECT i.sku, i.name, i.description, i.type, i.category, i.barcode, i.uom, i.cost, i.price, i.reorder_point,
                 i.active, COALESCE(SUM(s.qty), 0) AS qty_on_hand
          FROM items i LEFT JOIN stock s ON s.item_id = i.id GROUP BY i.id ORDER BY i.sku`,
  stock: `SELECT i.sku, i.name AS item_name, l.name AS location, s.qty
          FROM stock s JOIN items i ON i.id = s.item_id JOIN locations l ON l.id = s.location_id ORDER BY i.sku`,
  customers: "SELECT name, company, email, phone, address, notes FROM customers ORDER BY name",
  vendors: "SELECT name, company, email, phone, address, notes FROM vendors ORDER BY name",
  estimates: `SELECT e.number, c.name AS customer, e.status, e.order_date, e.expiry_date,
                     (SELECT COALESCE(SUM(qty * unit_price), 0) FROM estimate_lines WHERE estimate_id = e.id) AS total
              FROM estimates e JOIN customers c ON c.id = e.customer_id ORDER BY e.number`,
  sales_orders: `SELECT o.number, c.name AS customer, o.status, o.order_date,
                        (SELECT COALESCE(SUM(qty * unit_price), 0) FROM sales_order_lines WHERE order_id = o.id) AS total
                 FROM sales_orders o JOIN customers c ON c.id = o.customer_id ORDER BY o.number`,
  invoices: `SELECT inv.number, c.name AS customer, inv.status, inv.issue_date, inv.due_date, inv.sent_at, inv.paid_at,
                    (SELECT COALESCE(SUM(qty * unit_price), 0) FROM invoice_lines WHERE invoice_id = inv.id) AS total
             FROM invoices inv JOIN customers c ON c.id = inv.customer_id ORDER BY inv.number`,
  purchase_orders: `SELECT o.number, v.name AS vendor, o.status, o.order_date,
                           (SELECT COALESCE(SUM(qty * unit_cost), 0) FROM purchase_order_lines WHERE order_id = o.id) AS total
                    FROM purchase_orders o JOIN vendors v ON v.id = o.vendor_id ORDER BY o.number`,
  stock_moves: `SELECT m.created_at, i.sku, l.name AS location, m.delta, m.reason, m.note
                FROM stock_moves m JOIN items i ON i.id = m.item_id JOIN locations l ON l.id = m.location_id
                ORDER BY m.created_at DESC`,
};

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\r\n");
}

/**
 * Data export (super admin / full API key).
 *   GET /api/v1/export              -> complete JSON snapshot
 *   GET /api/v1/export?entity=items -> CSV of one entity
 */
export const GET = route({ write: false }, (req) => {
  const db = getDb();
  const url = new URL(req.url);
  const entity = url.searchParams.get("entity");

  if (entity) {
    const query = CSV_QUERIES[entity];
    if (!query) {
      return new Response(
        JSON.stringify({ error: { message: `Unknown entity '${entity}'. One of: ${Object.keys(CSV_QUERIES).join(", ")}` } }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }
    const csv = toCsv(db.prepare(query).all() as Record<string, unknown>[]);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="stockflow-${entity}-${today()}.csv"`,
      },
    });
  }

  const snapshot: Record<string, unknown> = { exported_at: new Date().toISOString(), format: "stockflow-v1" };
  for (const table of JSON_TABLES) {
    snapshot[table] = db.prepare(`SELECT * FROM ${table}`).all();
  }
  return new Response(JSON.stringify(snapshot, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="stockflow-export-${today()}.json"`,
    },
  });
});
