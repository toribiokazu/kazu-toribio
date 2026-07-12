"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Badge, EmptyState, money, PageHeader, timeAgo } from "@/components/ui";

type Dashboard = {
  stats: {
    items: number;
    locations: number;
    customers: number;
    vendors: number;
    open_sales_orders: number;
    open_purchase_orders: number;
    open_work_orders: number;
    inventory_value: number;
  };
  week: {
    estimates_created: number;
    deals_won: number;
    conversion_rate: number | null;
    revenue: number;
    gross_profit: number;
    units_shipped: number;
    orders_created: number;
    orders_fulfilled: number;
    fulfillment_rate: number | null;
  };
  low_stock: { id: string; sku: string; name: string; on_hand: number; reorder_point: number; uom: string }[];
  recent_events: { id: string; type: string; created_at: string }[];
  recent_orders: { id: string; number: string; status: string; customer_name: string; total: number }[];
};

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  useEffect(() => {
    api<{ data: Dashboard }>("/dashboard").then((r) => setData(r.data)).catch(() => {});
  }, []);

  const stats = data?.stats;
  const cards = [
    { label: "Inventory value", value: stats ? money(stats.inventory_value) : "…" },
    { label: "Active items", value: stats?.items ?? "…", href: "/items" },
    { label: "Open sales orders", value: stats?.open_sales_orders ?? "…", href: "/sales-orders" },
    { label: "Open purchase orders", value: stats?.open_purchase_orders ?? "…", href: "/purchase-orders" },
    { label: "Open work orders", value: stats?.open_work_orders ?? "…", href: "/manufacturing" },
    { label: "Customers", value: stats?.customers ?? "…", href: "/customers" },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="What's happening across your inventory right now" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => {
          const inner = (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{c.label}</p>
              <p className="mt-1.5 text-2xl font-bold tracking-tight">{c.value}</p>
            </div>
          );
          return c.href ? (
            <Link key={c.label} href={c.href}>
              {inner}
            </Link>
          ) : (
            <div key={c.label}>{inner}</div>
          );
        })}
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Last 7 days</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {[
            { label: "Estimates created", value: data ? String(data.week.estimates_created) : "…" },
            { label: "Deals won", value: data ? String(data.week.deals_won) : "…" },
            {
              label: "Conversion rate",
              value: data ? (data.week.conversion_rate === null ? "—" : `${Math.round(data.week.conversion_rate * 100)}%`) : "…",
              sub: data && data.week.estimates_created > 0 ? `${data.week.deals_won} of ${data.week.estimates_created} quotes` : "no estimates yet",
            },
            {
              label: "Gross profit",
              value: data ? money(data.week.gross_profit) : "…",
              sub: data ? `on ${money(data.week.revenue)} shipped revenue` : undefined,
              highlight: true,
            },
            { label: "Units shipped", value: data ? String(data.week.units_shipped) : "…" },
            {
              label: "Shipment fulfillment",
              value: data ? (data.week.fulfillment_rate === null ? "—" : `${Math.round(data.week.fulfillment_rate * 100)}%`) : "…",
              sub: data && data.week.orders_created > 0 ? `${data.week.orders_fulfilled} of ${data.week.orders_created} orders shipped in full` : "no orders this week",
            },
          ].map((c) => (
            <div
              key={c.label}
              className={`rounded-xl border p-4 shadow-sm ${c.highlight ? "border-indigo-200 bg-indigo-50/50" : "border-slate-200 bg-white"}`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{c.label}</p>
              <p className="mt-1.5 text-2xl font-bold tracking-tight">{c.value}</p>
              {c.sub && <p className="mt-0.5 text-xs text-slate-400">{c.sub}</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Low stock</h2>
          {data && data.low_stock.length === 0 ? (
            <EmptyState title="All items above reorder point" hint="Nice work — nothing needs reordering." />
          ) : (
            <div className="space-y-2">
              {data?.low_stock.map((i) => (
                <Link
                  key={i.id}
                  href={`/items/${i.id}`}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:border-rose-200"
                >
                  <div>
                    <p className="text-sm font-medium">{i.name}</p>
                    <p className="text-xs text-slate-400">{i.sku}</p>
                  </div>
                  <div className="text-right">
                    <Badge status="low">
                      {i.on_hand} / {i.reorder_point} {i.uom}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Recent sales orders</h2>
          {data && data.recent_orders.length === 0 ? (
            <EmptyState title="No sales orders yet" hint="Create your first order from the Sales Orders page." />
          ) : (
            <div className="space-y-2">
              {data?.recent_orders.map((o) => (
                <Link
                  key={o.id}
                  href={`/sales-orders/${o.id}`}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:border-indigo-200"
                >
                  <div>
                    <p className="text-sm font-medium">{o.number}</p>
                    <p className="text-xs text-slate-400">{o.customer_name}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{money(o.total)}</span>
                    <Badge status={o.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Activity feed</h2>
          {data && data.recent_events.length === 0 ? (
            <EmptyState title="No activity yet" hint="Events appear here as you work — and fan out to your webhooks." />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <ul className="divide-y divide-slate-100">
                {data?.recent_events.map((e) => (
                  <li key={e.id} className="flex items-center justify-between px-4 py-2.5">
                    <code className="text-xs font-medium text-indigo-700">{e.type}</code>
                    <span className="text-xs text-slate-400">{timeAgo(e.created_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
