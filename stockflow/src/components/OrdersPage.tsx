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

export type OrderKindCfg = {
  kind: "sales" | "purchase";
  path: string; // API + page path segment
  title: string;
  partyLabel: string;
  partyPath: "customers" | "vendors";
  partyField: "customer_id" | "vendor_id";
  partyNameField: "customer_name" | "vendor_name";
  priceField: "unit_price" | "unit_cost";
  priceLabel: string;
  doneStatus: "fulfilled" | "received";
  statuses: string[];
};

export const SALES_CFG: OrderKindCfg = {
  kind: "sales",
  path: "sales-orders",
  title: "Sales Orders",
  partyLabel: "Customer",
  partyPath: "customers",
  partyField: "customer_id",
  partyNameField: "customer_name",
  priceField: "unit_price",
  priceLabel: "Unit price",
  doneStatus: "fulfilled",
  statuses: ["open", "partial", "fulfilled", "canceled"],
};

export const PURCHASE_CFG: OrderKindCfg = {
  kind: "purchase",
  path: "purchase-orders",
  title: "Purchase Orders",
  partyLabel: "Vendor",
  partyPath: "vendors",
  partyField: "vendor_id",
  partyNameField: "vendor_name",
  priceField: "unit_cost",
  priceLabel: "Unit cost",
  doneStatus: "received",
  statuses: ["open", "partial", "received", "canceled"],
};

type OrderRow = {
  id: string;
  number: string;
  status: string;
  order_date: string;
  total: number;
  line_count: number;
  location_name: string;
} & Record<string, unknown>;

type Option = { id: string; name: string; sku?: string; price?: number; cost?: number };

export function OrdersListPage({ cfg }: { cfg: OrderKindCfg }) {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    const params = new URLSearchParams({ limit: "100" });
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    api<{ data: OrderRow[]; total: number }>(`/${cfg.path}?${params}`)
      .then((r) => {
        setRows(r.data);
        setTotal(r.total);
      })
      .catch((e) => toast(e.message, "error"));
  }, [cfg.path, q, status, toast]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <div>
      <PageHeader
        title={cfg.title}
        subtitle={`${total} order${total === 1 ? "" : "s"}`}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> New order
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search size={15} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
          <Input placeholder={`Search number or ${cfg.partyLabel.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <div className="w-44">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {cfg.statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No orders found" hint={`Create a ${cfg.kind} order to get started.`} />
      ) : (
        <Table headers={["Number", cfg.partyLabel, "Location", "Date", "Lines", "Total", "Status"]}>
          {rows.map((o) => (
            <tr key={o.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <Link href={`/${cfg.path}/${o.id}`} className="font-medium text-indigo-700 hover:underline">{o.number}</Link>
              </td>
              <td className="px-4 py-3">{String(o[cfg.partyNameField] ?? "")}</td>
              <td className="px-4 py-3 text-slate-500">{o.location_name}</td>
              <td className="px-4 py-3 text-slate-500">{o.order_date}</td>
              <td className="px-4 py-3 text-slate-500">{o.line_count}</td>
              <td className="px-4 py-3 font-medium">{money(o.total)}</td>
              <td className="px-4 py-3"><Badge status={o.status} /></td>
            </tr>
          ))}
        </Table>
      )}

      <NewOrderModal cfg={cfg} open={creating} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />
    </div>
  );
}

type DraftLine = { item_id: string; qty: string; price: string };

function NewOrderModal({
  cfg,
  open,
  onClose,
  onSaved,
}: {
  cfg: OrderKindCfg;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [parties, setParties] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [items, setItems] = useState<Option[]>([]);
  const [partyId, setPartyId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ item_id: "", qty: "1", price: "" }]);

  useEffect(() => {
    if (!open) return;
    setPartyId("");
    setNotes("");
    setLines([{ item_id: "", qty: "1", price: "" }]);
    api<{ data: Option[] }>(`/${cfg.partyPath}?limit=200`).then((r) => setParties(r.data));
    api<{ data: Option[] }>("/locations?limit=200").then((r) => {
      setLocations(r.data);
      if (r.data.length >= 1) setLocationId(r.data[0].id);
    });
    api<{ data: Option[] }>("/items?limit=200&active=true").then((r) => setItems(r.data));
  }, [open, cfg.partyPath]);

  const setLine = (i: number, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const defaultPrice = (itemId: string): string => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return "";
    return String((cfg.kind === "sales" ? item.price : item.cost) ?? "");
  };

  const orderTotal = lines.reduce((sum, l) => sum + (parseFloat(l.qty) || 0) * (parseFloat(l.price) || 0), 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        [cfg.partyField]: partyId,
        location_id: locationId,
        notes,
        lines: lines
          .filter((l) => l.item_id)
          .map((l) => ({
            item_id: l.item_id,
            qty: parseFloat(l.qty) || 0,
            [cfg.priceField]: l.price === "" ? undefined : parseFloat(l.price),
          })),
      };
      await api(`/${cfg.path}`, { method: "POST", body: JSON.stringify(payload) });
      toast("Order created");
      onSaved();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`New ${cfg.kind} order`} open={open} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label={cfg.partyLabel}>
            <Select required value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              <option value="">Select…</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Location">
            <Select required value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Select…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
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
                    onChange={(e) => setLine(i, { item_id: e.target.value, price: defaultPrice(e.target.value) })}
                  >
                    <option value="">Select item…</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>{it.sku} — {it.name}</option>
                    ))}
                  </Select>
                </div>
                <Input type="number" step="any" min="0.001" required value={line.qty} onChange={(e) => setLine(i, { qty: e.target.value })} placeholder="Qty" className="!w-24" />
                <Input type="number" step="0.01" min="0" value={line.price} onChange={(e) => setLine(i, { price: e.target.value })} placeholder={cfg.priceLabel} className="!w-32" />
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
            <p className="text-sm font-semibold">Total: {money(orderTotal)}</p>
          </div>
        </div>

        <Field label="Notes"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create order"}</Button>
        </div>
      </form>
    </Modal>
  );
}
