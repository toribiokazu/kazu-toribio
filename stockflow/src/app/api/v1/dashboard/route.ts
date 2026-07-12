import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";

export const GET = route({ write: false }, () => {
  const db = getDb();
  const scalar = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  const stats = {
    items: scalar("SELECT COUNT(*) AS n FROM items WHERE active = 1"),
    locations: scalar("SELECT COUNT(*) AS n FROM locations WHERE active = 1"),
    customers: scalar("SELECT COUNT(*) AS n FROM customers"),
    vendors: scalar("SELECT COUNT(*) AS n FROM vendors"),
    open_sales_orders: scalar("SELECT COUNT(*) AS n FROM sales_orders WHERE status IN ('open','partial')"),
    open_purchase_orders: scalar("SELECT COUNT(*) AS n FROM purchase_orders WHERE status IN ('open','partial')"),
    open_work_orders: scalar("SELECT COUNT(*) AS n FROM work_orders WHERE status IN ('open','in_progress')"),
    inventory_value: (
      db
        .prepare("SELECT COALESCE(SUM(s.qty * i.cost), 0) AS n FROM stock s JOIN items i ON i.id = s.item_id")
        .get() as { n: number }
    ).n,
  };
  const lowStock = db
    .prepare(
      `SELECT i.id, i.sku, i.name, i.reorder_point, i.uom, COALESCE(SUM(s.qty), 0) AS on_hand
       FROM items i LEFT JOIN stock s ON s.item_id = i.id
       WHERE i.active = 1 AND i.type = 'inventory' AND i.reorder_point > 0
       GROUP BY i.id HAVING on_hand <= i.reorder_point
       ORDER BY (on_hand / i.reorder_point) ASC LIMIT 10`
    )
    .all();
  const recentEvents = (
    db.prepare("SELECT * FROM events ORDER BY created_at DESC LIMIT 12").all() as Record<string, unknown>[]
  ).map((r) => ({ ...r, payload: JSON.parse(r.payload as string) }));
  const recentOrders = db
    .prepare(
      `SELECT o.id, o.number, o.status, o.order_date, c.name AS customer_name,
              (SELECT COALESCE(SUM(qty * unit_price), 0) FROM sales_order_lines WHERE order_id = o.id) AS total
       FROM sales_orders o JOIN customers c ON c.id = o.customer_id
       ORDER BY o.created_at DESC LIMIT 8`
    )
    .all();
  return json({ data: { stats, low_stock: lowStock, recent_events: recentEvents, recent_orders: recentOrders } });
});
