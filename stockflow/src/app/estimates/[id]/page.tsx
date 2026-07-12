"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Award, XCircle } from "lucide-react";
import { api, Badge, Button, money, PageHeader, Table, useToast } from "@/components/ui";

type Estimate = {
  id: string;
  number: string;
  status: string;
  customer_name: string;
  location_name: string;
  order_date: string;
  expiry_date: string;
  notes: string;
  sales_order_id: string;
  total: number;
  lines: { id: string; sku: string; item_name: string; uom: string; qty: number; unit_price: number }[];
};

export default function EstimateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    api<{ data: Estimate }>(`/estimates/${id}`)
      .then((r) => setEstimate(r.data))
      .catch((e) => toast(e.message, "error"));
  }, [id, toast]);
  useEffect(load, [load]);

  if (!estimate) return <p className="text-sm text-slate-400">Loading…</p>;

  const win = async () => {
    setBusy(true);
    try {
      const r = await api<{ data: { sales_order: { number: string } } }>(`/estimates/${id}/convert`, {
        method: "POST",
        body: "{}",
      });
      toast(`Deal won — created ${r.data.sales_order.number}`);
      load();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    if (!confirm(`Mark ${estimate.number} as declined?`)) return;
    try {
      await api(`/estimates/${id}`, { method: "PATCH", body: JSON.stringify({ status: "declined" }) });
      toast("Estimate declined");
      load();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  return (
    <div>
      <Link href="/estimates" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={14} /> All estimates
      </Link>
      <PageHeader
        title={estimate.number}
        subtitle={`${estimate.customer_name} · ${estimate.location_name} · ${estimate.order_date}${estimate.expiry_date ? ` · expires ${estimate.expiry_date}` : ""}`}
        actions={
          estimate.status === "open" ? (
            <>
              <Button variant="secondary" onClick={decline}>
                <XCircle size={15} /> Decline
              </Button>
              <Button onClick={win} disabled={busy}>
                <Award size={15} /> {busy ? "Converting…" : "Won — convert to order"}
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <Badge status={estimate.status === "accepted" ? "fulfilled" : estimate.status}>
          {estimate.status === "accepted" ? "won" : estimate.status}
        </Badge>
        <span className="text-sm text-slate-500">
          Total <strong className="text-slate-800">{money(estimate.total)}</strong>
        </span>
        {estimate.sales_order_id && (
          <Link href={`/sales-orders/${estimate.sales_order_id}`} className="text-sm font-medium text-indigo-700 hover:underline">
            View sales order →
          </Link>
        )}
      </div>

      <Table headers={["SKU", "Item", "Qty", "Unit price", "Amount"]}>
        {estimate.lines.map((l) => (
          <tr key={l.id}>
            <td className="px-4 py-3 font-medium">{l.sku}</td>
            <td className="px-4 py-3">{l.item_name}</td>
            <td className="px-4 py-3">{l.qty} {l.uom}</td>
            <td className="px-4 py-3 text-slate-500">{money(l.unit_price)}</td>
            <td className="px-4 py-3 font-medium">{money(l.qty * l.unit_price)}</td>
          </tr>
        ))}
      </Table>

      {estimate.notes && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</p>
          {estimate.notes}
        </div>
      )}
    </div>
  );
}
