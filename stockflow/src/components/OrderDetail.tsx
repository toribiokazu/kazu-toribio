"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, PackageCheck, XCircle } from "lucide-react";
import { api, Badge, Button, money, PageHeader, Table, useToast } from "@/components/ui";
import type { OrderKindCfg } from "./OrdersPage";

type Line = {
  id: string;
  sku: string;
  item_name: string;
  uom: string;
  qty: number;
  qty_fulfilled?: number;
  qty_received?: number;
  unit_price?: number;
  unit_cost?: number;
};

type Order = {
  id: string;
  number: string;
  status: string;
  order_date: string;
  notes: string;
  location_name: string;
  total: number;
  lines: Line[];
} & Record<string, unknown>;

export function OrderDetail({ cfg, id }: { cfg: OrderKindCfg; id: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    api<{ data: Order }>(`/${cfg.path}/${id}`)
      .then((r) => setOrder(r.data))
      .catch((e) => toast(e.message, "error"));
  }, [cfg.path, id, toast]);
  useEffect(load, [load]);

  if (!order) return <p className="text-sm text-slate-400">Loading…</p>;

  const doneField = cfg.kind === "sales" ? "qty_fulfilled" : "qty_received";
  const actionLabel = cfg.kind === "sales" ? "Fulfill remaining" : "Receive remaining";
  const actionPath = cfg.kind === "sales" ? "fulfill" : "receive";
  const canAct = order.status === "open" || order.status === "partial";

  const act = async () => {
    setBusy(true);
    try {
      await api(`/${cfg.path}/${id}/${actionPath}`, { method: "POST", body: "{}" });
      toast(cfg.kind === "sales" ? "Order fulfilled — stock deducted" : "Order received — stock added");
      load();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!confirm(`Cancel ${order.number}?`)) return;
    try {
      await api(`/${cfg.path}/${id}`, { method: "PATCH", body: JSON.stringify({ status: "canceled" }) });
      toast("Order canceled");
      load();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  return (
    <div>
      <Link href={`/${cfg.path}`} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={14} /> All {cfg.title.toLowerCase()}
      </Link>
      <PageHeader
        title={order.number}
        subtitle={`${String(order[cfg.partyNameField])} · ${order.location_name} · ${order.order_date}`}
        actions={
          <>
            {order.status === "open" && (
              <Button variant="secondary" onClick={cancel}>
                <XCircle size={15} /> Cancel order
              </Button>
            )}
            {canAct && (
              <Button onClick={act} disabled={busy}>
                <PackageCheck size={15} /> {busy ? "Working…" : actionLabel}
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <Badge status={order.status} />
        <span className="text-sm text-slate-500">Total <strong className="text-slate-800">{money(order.total)}</strong></span>
      </div>

      <Table headers={["SKU", "Item", "Ordered", cfg.kind === "sales" ? "Fulfilled" : "Received", "Remaining", cfg.priceLabel, "Amount"]}>
        {order.lines.map((l) => {
          const done = (l[doneField as keyof Line] as number) ?? 0;
          const price = (cfg.kind === "sales" ? l.unit_price : l.unit_cost) ?? 0;
          return (
            <tr key={l.id}>
              <td className="px-4 py-3 font-medium">{l.sku}</td>
              <td className="px-4 py-3">{l.item_name}</td>
              <td className="px-4 py-3">{l.qty} {l.uom}</td>
              <td className="px-4 py-3">{done}</td>
              <td className="px-4 py-3 font-medium">{l.qty - done}</td>
              <td className="px-4 py-3 text-slate-500">{money(price)}</td>
              <td className="px-4 py-3 font-medium">{money(l.qty * price)}</td>
            </tr>
          );
        })}
      </Table>

      {order.notes && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</p>
          {order.notes}
        </div>
      )}
    </div>
  );
}
