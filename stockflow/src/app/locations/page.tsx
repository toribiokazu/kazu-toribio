"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import {
  api,
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Table,
  useToast,
} from "@/components/ui";

type Location = { id: string; name: string; address: string; active: number };
const EMPTY = { name: "", address: "" };

export default function LocationsPage() {
  const [rows, setRows] = useState<Location[]>([]);
  const [editing, setEditing] = useState<Location | typeof EMPTY | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    api<{ data: Location[] }>("/locations?limit=200")
      .then((r) => setRows(r.data))
      .catch((e) => toast(e.message, "error"));
  }, [toast]);
  useEffect(load, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      if ("id" in editing) {
        await api(`/locations/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: editing.name, address: editing.address }),
        });
        toast("Location updated");
      } else {
        await api("/locations", { method: "POST", body: JSON.stringify(editing) });
        toast("Location created");
      }
      setEditing(null);
      load();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (row: Location) => {
    try {
      await api(`/locations/${row.id}`, { method: "PATCH", body: JSON.stringify({ active: !row.active }) });
      load();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  return (
    <div>
      <PageHeader
        title="Locations"
        subtitle="Warehouses, stores, vans — anywhere you keep stock"
        actions={
          <Button onClick={() => setEditing({ ...EMPTY })}>
            <Plus size={16} /> New location
          </Button>
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="No locations yet" hint="Create at least one location before receiving stock." />
      ) : (
        <Table headers={["Name", "Address", "Status", ""]}>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium">{r.name}</td>
              <td className="px-4 py-3 text-slate-500">{r.address || "—"}</td>
              <td className="px-4 py-3"><Badge status={r.active ? "active" : "inactive"} /></td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" onClick={() => setEditing(r)}><Pencil size={15} /></Button>
                  <Button variant="ghost" onClick={() => toggleActive(r)}>{r.active ? "Deactivate" : "Activate"}</Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal title={editing && "id" in editing ? "Edit location" : "New location"} open={editing !== null} onClose={() => setEditing(null)}>
        {editing && (
          <form onSubmit={save} className="space-y-4">
            <Field label="Name"><Input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Main Warehouse" /></Field>
            <Field label="Address"><Input value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
