"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Ban, Printer, Send } from "lucide-react";
import { api, Badge, Button, Field, Input, Modal, money, PageHeader, useToast } from "@/components/ui";

type Invoice = {
  id: string;
  number: string;
  status: string;
  issue_date: string;
  due_date: string;
  notes: string;
  sent_at: string;
  paid_at: string;
  email_to: string;
  customer_name: string;
  customer_company: string;
  customer_address: string;
  customer_email: string;
  order_number: string;
  sales_order_id: string;
  company_name: string;
  total: number;
  lines: { id: string; sku: string; description: string; qty: number; unit_price: number }[];
};

const STATUS_BADGE: Record<string, string> = { draft: "pending", sent: "open", paid: "fulfilled", void: "canceled" };

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [sending, setSending] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    api<{ data: Invoice }>(`/invoices/${id}`)
      .then((r) => {
        setInvoice(r.data);
        setSendTo(r.data.email_to || r.data.customer_email || "");
      })
      .catch((e) => toast(e.message, "error"));
  }, [id, toast]);
  useEffect(load, [load]);

  if (!invoice) return <p className="text-sm text-slate-400">Loading…</p>;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/invoices/${id}/send`, { method: "POST", body: JSON.stringify({ to: sendTo }) });
      toast(`Invoice emailed to ${sendTo}`);
      setSending(false);
      load();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: "paid" | "void") => {
    if (status === "void" && !confirm(`Void ${invoice.number}? This cannot be undone.`)) return;
    try {
      await api(`/invoices/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      toast(status === "paid" ? "Marked as paid" : "Invoice voided");
      load();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  return (
    <div>
      <div className="print:hidden">
        <Link href="/invoices" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft size={14} /> All invoices
        </Link>
        <PageHeader
          title={invoice.number}
          subtitle={`${invoice.customer_name} · from order ${invoice.order_number}`}
          actions={
            <>
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer size={15} /> Print / PDF
              </Button>
              {invoice.status !== "void" && (
                <Button variant="secondary" onClick={() => setSending(true)}>
                  <Send size={15} /> {invoice.sent_at ? "Resend email" : "Send email"}
                </Button>
              )}
              {(invoice.status === "draft" || invoice.status === "sent") && (
                <>
                  <Button onClick={() => setStatus("paid")}>
                    <BadgeCheck size={15} /> Mark paid
                  </Button>
                  <Button variant="ghost" onClick={() => setStatus("void")}>
                    <Ban size={15} /> Void
                  </Button>
                </>
              )}
            </>
          }
        />
        <div className="mb-6 flex items-center gap-3">
          <Badge status={STATUS_BADGE[invoice.status] || invoice.status}>{invoice.status}</Badge>
          {invoice.sent_at && (
            <span className="text-sm text-slate-500">
              sent to <strong className="text-slate-700">{invoice.email_to}</strong>
            </span>
          )}
          <Link href={`/sales-orders/${invoice.sales_order_id}`} className="text-sm font-medium text-indigo-700 hover:underline">
            View order →
          </Link>
        </div>
      </div>

      {/* Printable document */}
      <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-10 shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <div className="flex items-start justify-between">
          <h1 className="text-xl font-bold">{invoice.company_name}</h1>
          <div className="text-right">
            <p className="text-lg font-bold">Invoice {invoice.number}</p>
            <p className="text-sm text-slate-500">Order {invoice.order_number}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-between text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Billed to</p>
            <p className="mt-1 font-semibold">{invoice.customer_name}</p>
            {invoice.customer_company && <p className="text-slate-600">{invoice.customer_company}</p>}
            {invoice.customer_address && <p className="whitespace-pre-line text-slate-600">{invoice.customer_address}</p>}
          </div>
          <div className="text-right text-slate-600">
            <p>Issued: {invoice.issue_date}</p>
            {invoice.due_date && <p>Due: {invoice.due_date}</p>}
          </div>
        </div>
        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="py-2 pr-3">SKU</th>
              <th className="py-2 pr-3">Description</th>
              <th className="py-2 pr-3 text-right">Qty</th>
              <th className="py-2 pr-3 text-right">Price</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l) => (
              <tr key={l.id} className="border-b border-slate-100">
                <td className="py-2.5 pr-3 font-mono text-xs">{l.sku}</td>
                <td className="py-2.5 pr-3">{l.description}</td>
                <td className="py-2.5 pr-3 text-right">{l.qty}</td>
                <td className="py-2.5 pr-3 text-right">{money(l.unit_price)}</td>
                <td className="py-2.5 text-right font-medium">{money(l.qty * l.unit_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-6 text-right text-lg font-bold">Total due: {money(invoice.total)}</p>
        {invoice.notes && <p className="mt-6 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 print:bg-transparent print:p-0">{invoice.notes}</p>}
      </div>

      <Modal title={`Email ${invoice.number}`} open={sending} onClose={() => setSending(false)}>
        <form onSubmit={send} className="space-y-4">
          <Field label="Send to" hint={invoice.customer_email ? `Customer email on file: ${invoice.customer_email}` : "This customer has no email on file."}>
            <Input type="email" required value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="client@example.com" />
          </Field>
          <p className="text-xs text-slate-400">
            Sends a formatted invoice email via your configured provider (RESEND_API_KEY). The invoice is marked as sent.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setSending(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send invoice"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
