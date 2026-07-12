"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Badge, EmptyState, money, PageHeader, Table, useToast } from "@/components/ui";

type StockRow = {
  item_id: string;
  sku: string;
  item_name: string;
  uom: string;
  cost: number;
  reorder_point: number;
  location_name: string;
  qty: number;
};
type Item = { id: string; sku: string; name: string; uom: string; on_hand: number; reorder_point: number; category: string; cost: number };

export default function ReportsPage() {
  const [stock, setStock] = useState<StockRow[]>([]);
  const [lowStock, setLowStock] = useState<Item[]>([]);
  const toast = useToast();

  useEffect(() => {
    api<{ data: StockRow[] }>("/stock").then((r) => setStock(r.data)).catch((e) => toast(e.message, "error"));
    api<{ data: Item[] }>("/items?low_stock=true&limit=200").then((r) => setLowStock(r.data)).catch(() => {});
  }, [toast]);

  // Valuation grouped by item across locations
  const byItem = new Map<string, { sku: string; name: string; uom: string; qty: number; value: number }>();
  for (const row of stock) {
    const cur = byItem.get(row.item_id) || { sku: row.sku, name: row.item_name, uom: row.uom, qty: 0, value: 0 };
    cur.qty += row.qty;
    cur.value += row.qty * row.cost;
    byItem.set(row.item_id, cur);
  }
  const valuation = [...byItem.entries()].sort((a, b) => b[1].value - a[1].value);
  const totalValue = valuation.reduce((s, [, v]) => s + v.value, 0);

  return (
    <div>
      <PageHeader title="Reports" subtitle="Valuation and reorder insights (all data also available via the API)" />

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Inventory valuation</h2>
            <span className="text-sm font-bold">{money(totalValue)} total</span>
          </div>
          {valuation.length === 0 ? (
            <EmptyState title="No stock to value" hint="Valuation = on-hand quantity × item cost." />
          ) : (
            <Table headers={["SKU", "Item", "On hand", "Value"]}>
              {valuation.map(([id, v]) => (
                <tr key={id}>
                  <td className="px-4 py-3">
                    <Link href={`/items/${id}`} className="font-medium text-indigo-700 hover:underline">{v.sku}</Link>
                  </td>
                  <td className="px-4 py-3">{v.name}</td>
                  <td className="px-4 py-3 text-slate-500">{v.qty} {v.uom}</td>
                  <td className="px-4 py-3 font-medium">{money(v.value)}</td>
                </tr>
              ))}
            </Table>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Reorder report</h2>
          {lowStock.length === 0 ? (
            <EmptyState title="Nothing below reorder point" hint="Items appear here when on-hand ≤ reorder point." />
          ) : (
            <Table headers={["SKU", "Item", "On hand", "Reorder point", "Shortfall"]}>
              {lowStock.map((i) => (
                <tr key={i.id}>
                  <td className="px-4 py-3">
                    <Link href={`/items/${i.id}`} className="font-medium text-indigo-700 hover:underline">{i.sku}</Link>
                  </td>
                  <td className="px-4 py-3">{i.name}</td>
                  <td className="px-4 py-3"><Badge status="low">{i.on_hand} {i.uom}</Badge></td>
                  <td className="px-4 py-3 text-slate-500">{i.reorder_point}</td>
                  <td className="px-4 py-3 font-medium text-rose-600">{Math.max(0, i.reorder_point - i.on_hand)}</td>
                </tr>
              ))}
            </Table>
          )}
        </section>
      </div>
    </div>
  );
}
