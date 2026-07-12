"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  api,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Table,
  Textarea,
  useToast,
} from "@/components/ui";

type Party = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
};

const EMPTY = { name: "", company: "", email: "", phone: "", address: "", notes: "" };

export function PartyPage({ kind }: { kind: "customers" | "vendors" }) {
  const singular = kind === "customers" ? "customer" : "vendor";
  const [rows, setRows] = useState<Party[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Party | typeof EMPTY | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    const params = new URLSearchParams({ limit: "100" });
    if (q) params.set("q", q);
    api<{ data: Party[]; total: number }>(`/${kind}?${params}`)
      .then((r) => {
        setRows(r.data);
        setTotal(r.total);
      })
      .catch((e) => toast(e.message, "error"));
  }, [kind, q, toast]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      const isEdit = "id" in editing;
      const { id, ...payload } = editing as Party;
      if (isEdit) {
        await api(`/${kind}/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api(`/${kind}`, { method: "POST", body: JSON.stringify(payload) });
      }
      toast(`${singular[0].toUpperCase()}${singular.slice(1)} ${isEdit ? "updated" : "created"}`);
      setEditing(null);
      load();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: Party) => {
    if (!confirm(`Delete ${singular} "${row.name}"?`)) return;
    try {
      await api(`/${kind}/${row.id}`, { method: "DELETE" });
      toast(`Deleted ${row.name}`);
      load();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setEditing((f) => (f ? { ...f, [k]: e.target.value } : f));

  const title = kind === "customers" ? "Customers" : "Vendors";
  return (
    <div>
      <PageHeader
        title={title}
        subtitle={`${total} ${total === 1 ? singular : kind}`}
        actions={
          <Button onClick={() => setEditing({ ...EMPTY })}>
            <Plus size={16} /> New {singular}
          </Button>
        }
      />
      <div className="relative mb-4 w-72">
        <Search size={15} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
        <Input placeholder={`Search ${kind}…`} value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      {rows.length === 0 ? (
        <EmptyState title={q ? `No ${kind} match` : `No ${kind} yet`} hint={q ? "Try a different search." : `Add your first ${singular} to use them on orders.`} />
      ) : (
        <Table headers={["Name", "Company", "Email", "Phone", ""]}>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium">{r.name}</td>
              <td className="px-4 py-3 text-slate-500">{r.company || "—"}</td>
              <td className="px-4 py-3 text-slate-500">{r.email || "—"}</td>
              <td className="px-4 py-3 text-slate-500">{r.phone || "—"}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" onClick={() => setEditing(r)} title="Edit"><Pencil size={15} /></Button>
                  <Button variant="ghost" onClick={() => remove(r)} title="Delete"><Trash2 size={15} className="text-rose-500" /></Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal
        title={editing && "id" in editing ? `Edit ${singular}` : `New ${singular}`}
        open={editing !== null}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <form onSubmit={save} className="space-y-4">
            <Field label="Name"><Input required value={editing.name} onChange={set("name")} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Company"><Input value={editing.company} onChange={set("company")} /></Field>
              <Field label="Phone"><Input value={editing.phone} onChange={set("phone")} /></Field>
            </div>
            <Field label="Email"><Input type="email" value={editing.email} onChange={set("email")} /></Field>
            <Field label="Address"><Textarea rows={2} value={editing.address} onChange={set("address")} /></Field>
            <Field label="Notes"><Textarea rows={2} value={editing.notes} onChange={set("notes")} /></Field>
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
