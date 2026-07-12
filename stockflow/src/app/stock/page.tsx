"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, SlidersHorizontal } from "lucide-react";
import {
  api,
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Table,
  useToast,
} from "@/components/ui";
import { AdjustStockModal } from "@/components/AdjustStockModal";

type StockRow = {
  item_id: string;
  sku: string;
  item_name: string;
  uom: string;
  reorder_point: number;
  location_id: string;
  location_name: string;
  qty: number;
};
type Move = {
  id: string;
  sku: string;
  item_name: string;
  location_name: string;
  delta: number;
  reason: string;
  note: string;
  created_at: string;
};
type Option = { id: string; name: string; sku?: string };

export default function StockPage() {
  const [tab, setTab] = useState<"levels" | "moves">("levels");
  const [rows, setRows] = useState<StockRow[]>([]);
  const [moves, setMoves] = useState<Move[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [locationFilter, setLocationFilter] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    const params = locationFilter ? `?location_id=${locationFilter}` : "";
    api<{ data: StockRow[] }>(`/stock${params}`).then((r) => setRows(r.data)).catch((e) => toast(e.message, "error"));
    api<{ data: Move[] }>(`/stock/moves?limit=100${locationFilter ? `&location_id=${locationFilter}` : ""}`)
      .then((r) => setMoves(r.data))
      .catch(() => {});
  }, [locationFilter, toast]);

  useEffect(() => {
    api<{ data: Option[] }>("/locations?limit=200").then((r) => setLocations(r.data));
  }, []);
  useEffect(load, [load]);

  return (
    <div>
      <PageHeader
        title="Stock"
        subtitle="On-hand levels and every movement, by location"
        actions={
          <>
            <Button variant="secondary" onClick={() => setTransferring(true)}>
              <ArrowLeftRight size={15} /> Transfer
            </Button>
            <Button onClick={() => setAdjusting(true)}>
              <SlidersHorizontal size={15} /> Adjust
            </Button>
          </>
        }
      />

      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {(["levels", "moves"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize ${
                tab === t ? "bg-white shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t === "levels" ? "Levels" : "Movements"}
            </button>
          ))}
        </div>
        <div className="w-56">
          <Select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </Select>
        </div>
      </div>

      {tab === "levels" ? (
        rows.length === 0 ? (
          <EmptyState title="No stock on hand" hint="Receive a purchase order or make a positive adjustment to add stock." />
        ) : (
          <Table headers={["SKU", "Item", "Location", "On hand", ""]}>
            {rows.map((r) => (
              <tr key={`${r.item_id}-${r.location_id}`} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/items/${r.item_id}`} className="font-medium text-indigo-700 hover:underline">{r.sku}</Link>
                </td>
                <td className="px-4 py-3">{r.item_name}</td>
                <td className="px-4 py-3 text-slate-500">{r.location_name}</td>
                <td className="px-4 py-3 font-medium">{r.qty} {r.uom}</td>
                <td className="px-4 py-3">
                  {r.reorder_point > 0 && r.qty <= r.reorder_point && <Badge status="low">low</Badge>}
                </td>
              </tr>
            ))}
          </Table>
        )
      ) : moves.length === 0 ? (
        <EmptyState title="No movements yet" hint="Every receipt, shipment, build, transfer and adjustment shows up here." />
      ) : (
        <Table headers={["When", "SKU", "Item", "Location", "Change", "Reason", "Note"]}>
          {moves.map((m) => (
            <tr key={m.id} className="hover:bg-slate-50">
              <td className="whitespace-nowrap px-4 py-3 text-slate-500">{new Date(m.created_at).toLocaleString()}</td>
              <td className="px-4 py-3 font-medium">{m.sku}</td>
              <td className="px-4 py-3">{m.item_name}</td>
              <td className="px-4 py-3 text-slate-500">{m.location_name}</td>
              <td className={`px-4 py-3 font-medium ${m.delta < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {m.delta > 0 ? "+" : ""}{m.delta}
              </td>
              <td className="px-4 py-3"><Badge status={m.reason}>{m.reason.replace(/_/g, " ")}</Badge></td>
              <td className="px-4 py-3 text-slate-400">{m.note || "—"}</td>
            </tr>
          ))}
        </Table>
      )}

      <AdjustStockModal open={adjusting} onClose={() => setAdjusting(false)} onSaved={() => { setAdjusting(false); load(); }} />
      <TransferModal open={transferring} onClose={() => setTransferring(false)} onSaved={() => { setTransferring(false); load(); }} locations={locations} />
    </div>
  );
}

function TransferModal({
  open,
  onClose,
  onSaved,
  locations,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  locations: Option[];
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Option[]>([]);
  const [form, setForm] = useState({ item_id: "", from_location_id: "", to_location_id: "", qty: "", note: "" });

  useEffect(() => {
    if (!open) return;
    setForm({ item_id: "", from_location_id: "", to_location_id: "", qty: "", note: "" });
    api<{ data: (Option & { type: string })[] }>("/items?limit=200").then((r) =>
      setItems(r.data.filter((i) => (i as { type?: string }).type === "inventory"))
    );
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/stock/transfer", {
        method: "POST",
        body: JSON.stringify({ ...form, qty: parseFloat(form.qty) }),
      });
      toast("Stock transferred");
      onSaved();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Modal title="Transfer stock" open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Item">
          <Select required value={form.item_id} onChange={set("item_id")}>
            <option value="">Select an item…</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="From">
            <Select required value={form.from_location_id} onChange={set("from_location_id")}>
              <option value="">From location…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="To">
            <Select required value={form.to_location_id} onChange={set("to_location_id")}>
              <option value="">To location…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Quantity">
          <Input required type="number" step="any" min="0.001" value={form.qty} onChange={set("qty")} />
        </Field>
        <Field label="Note">
          <Input value={form.note} onChange={set("note")} placeholder="Optional context" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Transferring…" : "Transfer"}</Button>
        </div>
      </form>
    </Modal>
  );
}
