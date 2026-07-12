"use client";

import { useCallback, useEffect, useState } from "react";
import { Hammer, Plus, Trash2 } from "lucide-react";
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

type Option = { id: string; name: string; sku?: string; type?: string };
type Bom = {
  id: string;
  name: string;
  output_sku: string;
  output_item_name: string;
  output_qty: number;
  component_count: number;
};
type WorkOrder = {
  id: string;
  number: string;
  bom_name: string;
  output_sku: string;
  output_item_name: string;
  location_name: string;
  qty: number;
  status: string;
};

export default function ManufacturingPage() {
  const [tab, setTab] = useState<"work-orders" | "boms">("work-orders");
  const [boms, setBoms] = useState<Bom[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [creatingBom, setCreatingBom] = useState(false);
  const [creatingWo, setCreatingWo] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    api<{ data: Bom[] }>("/boms?limit=100").then((r) => setBoms(r.data)).catch((e) => toast(e.message, "error"));
    api<{ data: WorkOrder[] }>("/work-orders?limit=100").then((r) => setWorkOrders(r.data)).catch(() => {});
  }, [toast]);
  useEffect(load, [load]);

  const completeBuild = async (wo: WorkOrder) => {
    try {
      await api(`/work-orders/${wo.id}/complete`, { method: "POST", body: "{}" });
      toast(`${wo.number} built — components consumed, output added`);
      load();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  return (
    <div>
      <PageHeader
        title="Manufacturing"
        subtitle="Bills of materials and build orders"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreatingBom(true)}>
              <Plus size={15} /> New BOM
            </Button>
            <Button onClick={() => setCreatingWo(true)}>
              <Plus size={15} /> New work order
            </Button>
          </>
        }
      />

      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">
        {(["work-orders", "boms"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${tab === t ? "bg-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            {t === "work-orders" ? "Work orders" : "Bills of materials"}
          </button>
        ))}
      </div>

      {tab === "boms" ? (
        boms.length === 0 ? (
          <EmptyState title="No BOMs yet" hint="A bill of materials defines which components build a finished item." />
        ) : (
          <Table headers={["Name", "Builds", "Output qty", "Components"]}>
            {boms.map((b) => (
              <tr key={b.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{b.name}</td>
                <td className="px-4 py-3">{b.output_sku} — {b.output_item_name}</td>
                <td className="px-4 py-3 text-slate-500">{b.output_qty}</td>
                <td className="px-4 py-3 text-slate-500">{b.component_count}</td>
              </tr>
            ))}
          </Table>
        )
      ) : workOrders.length === 0 ? (
        <EmptyState title="No work orders yet" hint="Create a work order from a BOM, then complete it to build stock." />
      ) : (
        <Table headers={["Number", "BOM", "Output", "Location", "Builds", "Status", ""]}>
          {workOrders.map((w) => (
            <tr key={w.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium">{w.number}</td>
              <td className="px-4 py-3">{w.bom_name}</td>
              <td className="px-4 py-3 text-slate-500">{w.output_sku} — {w.output_item_name}</td>
              <td className="px-4 py-3 text-slate-500">{w.location_name}</td>
              <td className="px-4 py-3">{w.qty}</td>
              <td className="px-4 py-3"><Badge status={w.status} /></td>
              <td className="px-4 py-3 text-right">
                {(w.status === "open" || w.status === "in_progress") && (
                  <Button variant="secondary" onClick={() => completeBuild(w)}>
                    <Hammer size={14} /> Complete build
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      <NewBomModal open={creatingBom} onClose={() => setCreatingBom(false)} onSaved={() => { setCreatingBom(false); load(); }} />
      <NewWorkOrderModal open={creatingWo} onClose={() => setCreatingWo(false)} onSaved={() => { setCreatingWo(false); setTab("work-orders"); load(); }} boms={boms} />
    </div>
  );
}

function NewBomModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Option[]>([]);
  const [name, setName] = useState("");
  const [outputItemId, setOutputItemId] = useState("");
  const [outputQty, setOutputQty] = useState("1");
  const [lines, setLines] = useState<{ component_item_id: string; qty: string }[]>([{ component_item_id: "", qty: "1" }]);

  useEffect(() => {
    if (!open) return;
    setName("");
    setOutputItemId("");
    setOutputQty("1");
    setLines([{ component_item_id: "", qty: "1" }]);
    api<{ data: Option[] }>("/items?limit=200").then((r) => setItems(r.data.filter((i) => i.type === "inventory")));
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/boms", {
        method: "POST",
        body: JSON.stringify({
          name,
          output_item_id: outputItemId,
          output_qty: parseFloat(outputQty) || 1,
          lines: lines.filter((l) => l.component_item_id).map((l) => ({ component_item_id: l.component_item_id, qty: parseFloat(l.qty) || 0 })),
        }),
      });
      toast("BOM created");
      onSaved();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="New bill of materials" open={open} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name"><Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard widget assembly" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Output item (what gets built)">
            <Select required value={outputItemId} onChange={(e) => setOutputItemId(e.target.value)}>
              <option value="">Select…</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Output qty per build"><Input type="number" step="any" min="0.001" value={outputQty} onChange={(e) => setOutputQty(e.target.value)} /></Field>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Components consumed per build</p>
          <div className="space-y-2">
            {lines.map((line, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1">
                  <Select
                    required
                    value={line.component_item_id}
                    onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, component_item_id: e.target.value } : l)))}
                  >
                    <option value="">Select component…</option>
                    {items.filter((it) => it.id !== outputItemId).map((it) => (
                      <option key={it.id} value={it.id}>{it.sku} — {it.name}</option>
                    ))}
                  </Select>
                </div>
                <Input
                  type="number" step="any" min="0.001" required value={line.qty}
                  onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, qty: e.target.value } : l)))}
                  className="!w-24" placeholder="Qty"
                />
                <Button type="button" variant="ghost" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                  <Trash2 size={15} className="text-slate-400" />
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="secondary" className="mt-2" onClick={() => setLines((ls) => [...ls, { component_item_id: "", qty: "1" }])}>
            <Plus size={14} /> Add component
          </Button>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create BOM"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function NewWorkOrderModal({
  open,
  onClose,
  onSaved,
  boms,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  boms: Bom[];
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [locations, setLocations] = useState<Option[]>([]);
  const [form, setForm] = useState({ bom_id: "", location_id: "", qty: "1", notes: "" });

  useEffect(() => {
    if (!open) return;
    setForm({ bom_id: "", location_id: "", qty: "1", notes: "" });
    api<{ data: Option[] }>("/locations?limit=200").then((r) => {
      setLocations(r.data);
      if (r.data.length >= 1) setForm((f) => ({ ...f, location_id: r.data[0].id }));
    });
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/work-orders", {
        method: "POST",
        body: JSON.stringify({ ...form, qty: parseFloat(form.qty) || 1 }),
      });
      toast("Work order created");
      onSaved();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="New work order" open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Bill of materials">
          <Select required value={form.bom_id} onChange={(e) => setForm((f) => ({ ...f, bom_id: e.target.value }))}>
            <option value="">Select…</option>
            {boms.map((b) => (
              <option key={b.id} value={b.id}>{b.name} → {b.output_sku}</option>
            ))}
          </Select>
        </Field>
        <Field label="Location" hint="Components are consumed and output produced here.">
          <Select required value={form.location_id} onChange={(e) => setForm((f) => ({ ...f, location_id: e.target.value }))}>
            <option value="">Select…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Number of builds"><Input type="number" step="any" min="0.001" required value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} /></Field>
        <Field label="Notes"><Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional" /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create work order"}</Button>
        </div>
      </form>
    </Modal>
  );
}
