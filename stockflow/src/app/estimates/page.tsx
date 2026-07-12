"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, Trash2 } from "lucide-react";
import {
  api,
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  money,
  PageHeader,
  Select,
  Table,
  useToast,
} from "@/components/ui";

type Estimate = {
  id: string;
  number: string;
  status: string;
  customer_name: string;
  location_name: string;
  order_date: string;
  expiry_date: string;
  total: number;
  line_count: number;
  sales_order_id: string;
};
type Option = { id: string; name: string; sku?: string; price?: number };
type DraftLine = { item_id: string; qty: string; price: string };

export default function EstimatesPage() {
  const [rows, setRows] = useState<Estimate[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    const params = new URLSearchParams({ limit: "100" });
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    api<{ data: Estimate[]; total: number }>(`/estimates?${params}`)
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
        title="Estimates"
        subtitle={`${total} quote${total === 1 ? "" : "s"} — win one to turn it into a sales order`}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> New estimate
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search size={15} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
          <Input placeholder="Search number or customer…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <div className="w-44">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="open">open</option>
            <option value="accepted">won</option>
            <option value="declined">declined</option>
          </Select>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No estimates found" hint="Create a quote for a customer; accepting it creates the sales order automatically." />
      ) : (
        <Table headers={["Number", "Customer", "Date", "Expires", "Lines", "Total", "Status"]}>
          {rows.map((e) => (
            <tr key={e.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <Link href={`/estimates/${e.id}`} className="font-medium text-indigo-700 hover:underline">{e.number}</Link>
              </td>
              <td className="px-4 py-3">{e.customer_name}</td>
              <td className="px-4 py-3 text-slate-500">{e.order_date}</td>
              <td className="px-4 py-3 text-slate-500">{e.expiry_date || "—"}</td>
              <td className="px-4 py-3 text-slate-500">{e.line_count}</td>
              <td className="px-4 py-3 font-medium">{money(e.total)}</td>
              <td className="px-4 py-3">
                <Badge status={e.status === "accepted" ? "fulfilled" : e.status}>
                  {e.status === "accepted" ? "won" : e.status}
                </Badge>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <NewEstimateModal open={creating} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />
    </div>
  );
}

function NewEstimateModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [customers, setCustomers] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [items, setItems] = useState<Option[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ item_id: "", qty: "1", price: "" }]);

  useEffect(() => {
    if (!open) return;
    setCustomerId("");
    setExpiryDate("");
    setNotes("");
    setLines([{ item_id: "", qty: "1", price: "" }]);
    api<{ data: Option[] }>("/customers?limit=200").then((r) => setCustomers(r.data));
    api<{ data: Option[] }>("/locations?limit=200").then((r) => {
      setLocations(r.data);
      if (r.data.length >= 1) setLocationId(r.data[0].id);
    });
    api<{ data: Option[] }>("/items?limit=200&active=true").then((r) => setItems(r.data));
  }, [open]);

  const setLine = (i: number, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const estTotal = lines.reduce((s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.price) || 0), 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/estimates", {
        method: "POST",
        body: JSON.stringify({
          customer_id: customerId,
          location_id: locationId,
          expiry_date: expiryDate,
          notes,
          lines: lines
            .filter((l) => l.item_id)
            .map((l) => ({
              item_id: l.item_id,
              qty: parseFloat(l.qty) || 0,
              unit_price: l.price === "" ? undefined : parseFloat(l.price),
            })),
        }),
      });
      toast("Estimate created");
      onSaved();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="New estimate" open={open} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Customer">
            <Select required value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Select…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Fulfill from">
            <Select required value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Select…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Expires">
            <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </Field>
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Lines</p>
          <div className="space-y-2">
            {lines.map((line, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1">
                  <Select
                    required
                    value={line.item_id}
                    onChange={(e) => {
                      const item = items.find((it) => it.id === e.target.value);
                      setLine(i, { item_id: e.target.value, price: String(item?.price ?? "") });
                    }}
                  >
                    <option value="">Select item…</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>{it.sku} — {it.name}</option>
                    ))}
                  </Select>
                </div>
                <Input type="number" step="any" min="0.001" required value={line.qty} onChange={(e) => setLine(i, { qty: e.target.value })} placeholder="Qty" className="!w-24" />
                <Input type="number" step="0.01" min="0" value={line.price} onChange={(e) => setLine(i, { price: e.target.value })} placeholder="Unit price" className="!w-32" />
                <Button type="button" variant="ghost" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1}>
                  <Trash2 size={15} className="text-slate-400" />
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, { item_id: "", qty: "1", price: "" }])}>
              <Plus size={14} /> Add line
            </Button>
            <p className="text-sm font-semibold">Total: {money(estTotal)}</p>
          </div>
        </div>

        <Field label="Notes"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create estimate"}</Button>
        </div>
      </form>
    </Modal>
  );
}
