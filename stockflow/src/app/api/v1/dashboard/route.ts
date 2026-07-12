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
  // Rolling last-7-days sales metrics
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const estimatesCreated = (
    db.prepare("SELECT COUNT(*) AS n FROM estimates WHERE created_at >= ?").get(weekAgo) as { n: number }
  ).n;
  const dealsWon = (
    db.prepare("SELECT COUNT(*) AS n FROM estimates WHERE status = 'accepted' AND decided_at >= ?").get(weekAgo) as {
      n: number;
    }
  ).n;
  const shipped = db
    .prepare(
      `SELECT COALESCE(SUM(-m.delta), 0) AS units,
              COALESCE(SUM(-m.delta * COALESCE(sol.unit_price, i.price)), 0) AS revenue,
              COALESCE(SUM(-m.delta * i.cost), 0) AS cogs
       FROM stock_moves m
       JOIN items i ON i.id = m.item_id
       LEFT JOIN sales_order_lines sol ON sol.order_id = m.ref_id AND sol.item_id = m.item_id
       WHERE m.reason = 'sale' AND m.created_at >= ?`
    )
    .get(weekAgo) as { units: number; revenue: number; cogs: number };
  const weekOrders = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'fulfilled' THEN 1 ELSE 0 END) AS fulfilled
       FROM sales_orders WHERE created_at >= ? AND status != 'canceled'`
    )
    .get(weekAgo) as { total: number; fulfilled: number | null };
  const week = {
    estimates_created: estimatesCreated,
    deals_won: dealsWon,
    conversion_rate: estimatesCreated > 0 ? dealsWon / estimatesCreated : null,
    revenue: shipped.revenue,
    gross_profit: shipped.revenue - shipped.cogs,
    units_shipped: shipped.units,
    orders_created: weekOrders.total,
    orders_fulfilled: weekOrders.fulfilled ?? 0,
    fulfillment_rate: weekOrders.total > 0 ? (weekOrders.fulfilled ?? 0) / weekOrders.total : null,
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
  return json({ data: { stats, week, low_stock: lowStock, recent_events: recentEvents, recent_orders: recentOrders } });
});
