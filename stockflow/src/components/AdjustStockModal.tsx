"use client";

import { useEffect, useState } from "react";
import { api, Button, Field, Input, Modal, Select, useToast } from "@/components/ui";

type Option = { id: string; name: string; sku?: string };

export function AdjustStockModal({
  open,
  onClose,
  onSaved,
  itemId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  itemId?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [form, setForm] = useState({ item_id: "", location_id: "", delta: "", reason: "adjustment", note: "" });

  useEffect(() => {
    if (!open) return;
    setForm((f) => ({ ...f, item_id: itemId || "", delta: "", note: "" }));
    if (!itemId) {
      api<{ data: (Option & { type: string })[] }>("/items?limit=200").then((r) =>
        setItems(r.data.filter((i) => (i as { type?: string }).type === "inventory"))
      );
    }
    api<{ data: Option[] }>("/locations?limit=200").then((r) => {
      setLocations(r.data);
      if (r.data.length === 1) setForm((f) => ({ ...f, location_id: r.data[0].id }));
    });
  }, [open, itemId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/stock/adjust", {
        method: "POST",
        body: JSON.stringify({
          item_id: form.item_id,
          location_id: form.location_id,
          delta: parseFloat(form.delta),
          reason: form.reason,
          note: form.note,
        }),
      });
      toast("Stock adjusted");
      onSaved();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Adjust stock" open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {!itemId && (
          <Field label="Item">
            <Select required value={form.item_id} onChange={(e) => setForm((f) => ({ ...f, item_id: e.target.value }))}>
              <option value="">Select an item…</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Location">
          <Select required value={form.location_id} onChange={(e) => setForm((f) => ({ ...f, location_id: e.target.value }))}>
            <option value="">Select a location…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Quantity change" hint="Positive adds stock, negative removes it. e.g. -3">
          <Input required type="number" step="any" value={form.delta} onChange={(e) => setForm((f) => ({ ...f, delta: e.target.value }))} placeholder="+10 or -3" />
        </Field>
        <Field label="Reason">
          <Select value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}>
            <option value="adjustment">General adjustment</option>
            <option value="recount">Cycle count / recount</option>
            <option value="damage">Damaged</option>
            <option value="shrinkage">Shrinkage / loss</option>
            <option value="found">Found stock</option>
          </Select>
        </Field>
        <Field label="Note">
          <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Optional context" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Apply adjustment"}</Button>
        </div>
      </form>
    </Modal>
  );
}
