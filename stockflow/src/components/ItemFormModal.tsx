"use client";

import { useEffect, useState } from "react";
import { api, Button, Field, Input, Modal, Select, useToast } from "@/components/ui";

export type Item = {
  id: string;
  sku: string;
  name: string;
  type: string;
  category: string;
  uom: string;
  cost: number;
  price: number;
  reorder_point: number;
  active: number;
  on_hand: number;
};

export function ItemFormModal({
  open,
  onClose,
  onSaved,
  item,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  item?: Partial<Item> & { description?: string; barcode?: string };
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    sku: "", name: "", description: "", type: "inventory", category: "", barcode: "",
    uom: "ea", cost: "0", price: "0", reorder_point: "0",
  });

  useEffect(() => {
    if (open) {
      setForm({
        sku: item?.sku || "", name: item?.name || "", description: item?.description || "",
        type: item?.type || "inventory", category: item?.category || "", barcode: item?.barcode || "",
        uom: item?.uom || "ea", cost: String(item?.cost ?? 0), price: String(item?.price ?? 0),
        reorder_point: String(item?.reorder_point ?? 0),
      });
    }
  }, [open, item]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        ...form,
        cost: parseFloat(form.cost) || 0,
        price: parseFloat(form.price) || 0,
        reorder_point: parseFloat(form.reorder_point) || 0,
      };
      if (item?.id) {
        await api(`/items/${item.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast("Item updated");
      } else {
        await api("/items", { method: "POST", body: JSON.stringify(payload) });
        toast("Item created");
      }
      onSaved();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={item?.id ? "Edit item" : "New item"} open={open} onClose={onClose} wide>
      <form onSubmit={submit} className="grid grid-cols-2 gap-4">
        <Field label="SKU"><Input required value={form.sku} onChange={set("sku")} placeholder="WID-001" /></Field>
        <Field label="Name"><Input required value={form.name} onChange={set("name")} placeholder="Widget" /></Field>
        <div className="col-span-2">
          <Field label="Description"><Input value={form.description} onChange={set("description")} /></Field>
        </div>
        <Field label="Type">
          <Select value={form.type} onChange={set("type")}>
            <option value="inventory">Inventory (tracked)</option>
            <option value="non_inventory">Non-inventory</option>
            <option value="service">Service</option>
          </Select>
        </Field>
        <Field label="Category"><Input value={form.category} onChange={set("category")} placeholder="Widgets" /></Field>
        <Field label="Barcode"><Input value={form.barcode} onChange={set("barcode")} /></Field>
        <Field label="Unit of measure"><Input value={form.uom} onChange={set("uom")} placeholder="ea" /></Field>
        <Field label="Cost"><Input type="number" step="0.01" min="0" value={form.cost} onChange={set("cost")} /></Field>
        <Field label="Price"><Input type="number" step="0.01" min="0" value={form.price} onChange={set("price")} /></Field>
        <Field label="Reorder point" hint="Get a stock.low event when total on-hand falls to this level.">
          <Input type="number" step="1" min="0" value={form.reorder_point} onChange={set("reorder_point")} />
        </Field>
        <div className="col-span-2 mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : item?.id ? "Save changes" : "Create item"}</Button>
        </div>
      </form>
    </Modal>
  );
}
