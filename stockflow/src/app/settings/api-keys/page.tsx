"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Plus } from "lucide-react";
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
  timeAgo,
  useToast,
} from "@/components/ui";

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  scope: "full" | "read";
  last_used_at: string;
  created_at: string;
  revoked_at: string;
};

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", scope: "full" });
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    api<{ data: ApiKey[] }>("/api-keys").then((r) => setKeys(r.data)).catch((e) => toast(e.message, "error"));
  }, [toast]);
  useEffect(load, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ data: { token: string } }>("/api-keys", { method: "POST", body: JSON.stringify(form) });
      setNewToken(r.data.token);
      setCreating(false);
      setForm({ name: "", scope: "full" });
      load();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (key: ApiKey) => {
    if (!confirm(`Revoke "${key.name}"? Integrations using it will stop working immediately.`)) return;
    try {
      await api(`/api-keys/${key.id}`, { method: "DELETE" });
      toast("Key revoked");
      load();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  return (
    <div>
      <PageHeader
        title="API Keys"
        subtitle="Authenticate external integrations against the REST API"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> New key
          </Button>
        }
      />

      <div className="mb-6 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm text-indigo-900">
        Send the key as a bearer token: <code className="rounded bg-white px-1.5 py-0.5 text-xs">Authorization: Bearer sfk_…</code> — see the <a href="/docs" className="font-medium underline">API docs</a> for examples.
      </div>

      {keys.length === 0 ? (
        <EmptyState title="No API keys yet" hint="Create a key to call the API from your scripts, Zapier, n8n, or anything that speaks HTTP." />
      ) : (
        <Table headers={["Name", "Key", "Scope", "Last used", "Created", "Status", ""]}>
          {keys.map((k) => (
            <tr key={k.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium">{k.name}</td>
              <td className="px-4 py-3"><code className="text-xs text-slate-500">{k.prefix}…</code></td>
              <td className="px-4 py-3"><Badge status={k.scope === "full" ? "active" : "pending"}>{k.scope === "full" ? "read/write" : "read-only"}</Badge></td>
              <td className="px-4 py-3 text-slate-500">{k.last_used_at ? timeAgo(k.last_used_at) : "never"}</td>
              <td className="px-4 py-3 text-slate-500">{timeAgo(k.created_at)}</td>
              <td className="px-4 py-3"><Badge status={k.revoked_at ? "canceled" : "active"}>{k.revoked_at ? "revoked" : "active"}</Badge></td>
              <td className="px-4 py-3 text-right">
                {!k.revoked_at && (
                  <Button variant="ghost" onClick={() => revoke(k)} className="text-rose-600">Revoke</Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal title="New API key" open={creating} onClose={() => setCreating(false)}>
        <form onSubmit={create} className="space-y-4">
          <Field label="Name" hint="What will use this key? e.g. 'Zapier', 'Shopify sync'">
            <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Scope">
            <Select value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}>
              <option value="full">Read/write — full access</option>
              <option value="read">Read-only — GET endpoints only</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create key"}</Button>
          </div>
        </form>
      </Modal>

      <Modal title="Copy your API key" open={newToken !== null} onClose={() => setNewToken(null)}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            This is the only time the full key is shown. Store it somewhere safe — only a hash is kept on the server.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <KeyRound size={15} className="shrink-0 text-slate-400" />
            <code className="min-w-0 flex-1 break-all text-xs">{newToken}</code>
            <Button
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText(newToken || "");
                toast("Copied to clipboard");
              }}
            >
              <Copy size={14} /> Copy
            </Button>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setNewToken(null)}>Done</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
