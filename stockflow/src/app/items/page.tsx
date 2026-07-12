"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import {
  api,
  Badge,
  Button,
  EmptyState,
  Input,
  money,
  PageHeader,
  Table,
  useToast,
} from "@/components/ui";
import { ItemFormModal, type Item } from "@/components/ItemFormModal";

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    const params = new URLSearchParams({ limit: "100" });
    if (q) params.set("q", q);
    if (lowOnly) params.set("low_stock", "true");
    api<{ data: Item[]; total: number }>(`/items?${params}`)
      .then((r) => {
        setItems(r.data);
        setTotal(r.total);
      })
      .catch((e) => toast(e.message, "error"));
  }, [q, lowOnly, toast]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <div>
      <PageHeader
        title="Items"
        subtitle={`${total} item${total === 1 ? "" : "s"} in your catalog`}
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={16} /> New item
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search size={15} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
          <Input placeholder="Search SKU, name, barcode…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} className="accent-indigo-600" />
          Low stock only
        </label>
      </div>

      {items.length === 0 ? (
        <EmptyState title={q || lowOnly ? "No items match" : "No items yet"} hint={q || lowOnly ? "Try a different search." : "Create your first item to start tracking inventory."} />
      ) : (
        <Table headers={["SKU", "Name", "Type", "Category", "On hand", "Cost", "Price", "Status"]}>
          {items.map((i) => (
            <tr key={i.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <Link href={`/items/${i.id}`} className="font-medium text-indigo-700 hover:underline">
                  {i.sku}
                </Link>
              </td>
              <td className="px-4 py-3">{i.name}</td>
              <td className="px-4 py-3 text-slate-500">{i.type.replace("_", "-")}</td>
              <td className="px-4 py-3 text-slate-500">{i.category || "—"}</td>
              <td className="px-4 py-3">
                {i.type === "inventory" ? (
                  <span className={i.reorder_point > 0 && i.on_hand <= i.reorder_point ? "font-semibold text-rose-600" : ""}>
                    {i.on_hand} {i.uom}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3 text-slate-500">{money(i.cost)}</td>
              <td className="px-4 py-3 text-slate-500">{money(i.price)}</td>
              <td className="px-4 py-3">
                <Badge status={i.active ? "active" : "inactive"} />
              </td>
            </tr>
          ))}
        </Table>
      )}

      <ItemFormModal open={showCreate} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />
    </div>
  );
}
