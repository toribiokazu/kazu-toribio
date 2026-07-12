"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, SlidersHorizontal } from "lucide-react";
import { api, Badge, Button, money, PageHeader, Table, useToast } from "@/components/ui";
import { ItemFormModal, type Item } from "@/components/ItemFormModal";
import { AdjustStockModal } from "@/components/AdjustStockModal";

type ItemDetail = Item & {
  description: string;
  barcode: string;
  stock: { location_id: string; location_name: string; qty: number }[];
  recent_moves: { id: string; delta: number; reason: string; location_name: string; note: string; created_at: string }[];
};

export default function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    api<{ data: ItemDetail }>(`/items/${id}`)
      .then((r) => setItem(r.data))
      .catch((e) => toast(e.message, "error"));
  }, [id, toast]);
  useEffect(load, [load]);

  if (!item) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div>
      <Link href="/items" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={14} /> All items
      </Link>
      <PageHeader
        title={item.name}
        subtitle={`${item.sku}${item.category ? ` · ${item.category}` : ""}`}
        actions={
          <>
            {item.type === "inventory" && (
              <Button variant="secondary" onClick={() => setAdjusting(true)}>
                <SlidersHorizontal size={15} /> Adjust stock
              </Button>
            )}
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil size={15} /> Edit
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "On hand", value: item.type === "inventory" ? `${item.on_hand} ${item.uom}` : "n/a" },
          { label: "Cost", value: money(item.cost) },
          { label: "Price", value: money(item.price) },
          { label: "Reorder point", value: item.reorder_point > 0 ? `${item.reorder_point} ${item.uom}` : "not set" },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{c.label}</p>
            <p className="mt-1 text-xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      {item.description && <p className="mb-6 max-w-2xl text-sm text-slate-600">{item.description}</p>}

      {item.type === "inventory" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Stock by location</h2>
            {item.stock.length === 0 ? (
              <p className="text-sm text-slate-400">No stock recorded at any location.</p>
            ) : (
              <Table headers={["Location", "Quantity"]}>
                {item.stock.map((s) => (
                  <tr key={s.location_id}>
                    <td className="px-4 py-3">{s.location_name}</td>
                    <td className="px-4 py-3 font-medium">{s.qty} {item.uom}</td>
                  </tr>
                ))}
              </Table>
            )}
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Recent movements</h2>
            {item.recent_moves.length === 0 ? (
              <p className="text-sm text-slate-400">No movements yet.</p>
            ) : (
              <Table headers={["When", "Location", "Change", "Reason"]}>
                {item.recent_moves.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3 text-slate-500">{new Date(m.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3">{m.location_name}</td>
                    <td className={`px-4 py-3 font-medium ${m.delta < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                      {m.delta > 0 ? "+" : ""}{m.delta}
                    </td>
                    <td className="px-4 py-3"><Badge status={m.reason}>{m.reason.replace(/_/g, " ")}</Badge></td>
                  </tr>
                ))}
              </Table>
            )}
          </section>
        </div>
      )}

      <ItemFormModal open={editing} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} item={item} />
      <AdjustStockModal open={adjusting} onClose={() => setAdjusting(false)} onSaved={() => { setAdjusting(false); load(); }} itemId={item.id} />
    </div>
  );
}
