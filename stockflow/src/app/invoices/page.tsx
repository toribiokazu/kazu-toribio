"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import {
  api,
  Badge,
  EmptyState,
  Input,
  money,
  PageHeader,
  Select,
  Table,
  timeAgo,
  useToast,
} from "@/components/ui";

type Invoice = {
  id: string;
  number: string;
  status: string;
  customer_name: string;
  order_number: string;
  issue_date: string;
  due_date: string;
  sent_at: string;
  total: number;
};

const STATUS_BADGE: Record<string, string> = { draft: "pending", sent: "open", paid: "fulfilled", void: "canceled" };

export default function InvoicesPage() {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const toast = useToast();

  const load = useCallback(() => {
    const params = new URLSearchParams({ limit: "100" });
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    api<{ data: Invoice[]; total: number }>(`/invoices?${params}`)
      .then((r) => {
        setRows(r.data);
        setTotal(r.total);
      })
      .catch((e) => toast(e.message, "error"));
  }, [q, status, toast]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle={`${total} invoice${total === 1 ? "" : "s"} — create them from a sales order`}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search size={15} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
          <Input placeholder="Search number or customer…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <div className="w-44">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {["draft", "sent", "paid", "void"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No invoices yet" hint="Open a sales order and click 'Create invoice'." />
      ) : (
        <Table headers={["Number", "Customer", "Order", "Issued", "Due", "Sent", "Total", "Status"]}>
          {rows.map((inv) => (
            <tr key={inv.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <Link href={`/invoices/${inv.id}`} className="font-medium text-indigo-700 hover:underline">{inv.number}</Link>
              </td>
              <td className="px-4 py-3">{inv.customer_name}</td>
              <td className="px-4 py-3 text-slate-500">{inv.order_number}</td>
              <td className="px-4 py-3 text-slate-500">{inv.issue_date}</td>
              <td className="px-4 py-3 text-slate-500">{inv.due_date || "—"}</td>
              <td className="px-4 py-3 text-slate-500">{inv.sent_at ? timeAgo(inv.sent_at) : "—"}</td>
              <td className="px-4 py-3 font-medium">{money(inv.total)}</td>
              <td className="px-4 py-3"><Badge status={STATUS_BADGE[inv.status] || inv.status}>{inv.status}</Badge></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
