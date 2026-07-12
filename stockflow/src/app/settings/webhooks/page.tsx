"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
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
  timeAgo,
  useToast,
} from "@/components/ui";

type Webhook = {
  id: string;
  url: string;
  description: string;
  events: string[];
  active: number;
  delivery_count: number;
  failed_count: number;
  created_at: string;
};
type Delivery = {
  id: string;
  event_type: string;
  status: string;
  attempts: number;
  response_status: number | null;
  response_body: string;
  last_attempt_at: string;
  created_at: string;
  payload: string;
};

const EVENT_GROUPS = ["*", "item.*", "stock.*", "sales_order.*", "purchase_order.*", "work_order.*", "customer.*", "vendor.*", "bom.*", "location.*"];

export default function WebhooksPage() {
  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [creating, setCreating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState<Webhook | null>(null);
  const toast = useToast();

  const load = useCallback(() => {
    api<{ data: Webhook[] }>("/webhooks").then((r) => setHooks(r.data)).catch((e) => toast(e.message, "error"));
  }, [toast]);
  useEffect(load, [load]);

  const test = async (hook: Webhook) => {
    try {
      const r = await api<{ data: Delivery }>(`/webhooks/${hook.id}/test`, { method: "POST", body: "{}" });
      if (r.data.status === "success") toast(`Test delivered — HTTP ${r.data.response_status}`);
      else toast(`Test failed: ${r.data.response_body || `HTTP ${r.data.response_status}`}`, "error");
      load();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const toggle = async (hook: Webhook) => {
    try {
      await api(`/webhooks/${hook.id}`, { method: "PATCH", body: JSON.stringify({ active: !hook.active }) });
      load();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const remove = async (hook: Webhook) => {
    if (!confirm(`Delete webhook to ${hook.url}?`)) return;
    try {
      await api(`/webhooks/${hook.id}`, { method: "DELETE" });
      toast("Webhook deleted");
      load();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  return (
    <div>
      <PageHeader
        title="Webhooks"
        subtitle="Push events to any URL the moment they happen — signed, retried, logged"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> New webhook
          </Button>
        }
      />

      {hooks.length === 0 ? (
        <EmptyState
          title="No webhooks yet"
          hint="Subscribe a URL to events like stock.low or sales_order.created and StockFlow will POST signed JSON to it."
        />
      ) : (
        <div className="space-y-3">
          {hooks.map((h) => (
            <div key={h.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="truncate text-sm font-medium">{h.url}</code>
                    <Badge status={h.active ? "active" : "inactive"} />
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {h.description || "No description"} · created {timeAgo(h.created_at)} · {h.delivery_count} deliveries
                    {h.failed_count > 0 && <span className="text-rose-500"> ({h.failed_count} failed)</span>}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {h.events.map((e) => (
                      <span key={e} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{e}</span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button variant="secondary" onClick={() => test(h)}><Send size={14} /> Test</Button>
                  <Button variant="secondary" onClick={() => setInspecting(h)}>Deliveries</Button>
                  <Button variant="ghost" onClick={() => toggle(h)}>{h.active ? "Disable" : "Enable"}</Button>
                  <Button variant="ghost" onClick={() => remove(h)}><Trash2 size={15} className="text-rose-500" /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <NewWebhookModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(secret) => {
          setCreating(false);
          setNewSecret(secret);
          load();
        }}
      />

      <Modal title="Webhook signing secret" open={newSecret !== null} onClose={() => setNewSecret(null)}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Use this secret to verify the <code className="text-xs">X-StockFlow-Signature</code> header on incoming
            deliveries. It is shown only once.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <code className="min-w-0 flex-1 break-all text-xs">{newSecret}</code>
            <Button
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText(newSecret || "");
                toast("Copied");
              }}
            >
              <Copy size={14} /> Copy
            </Button>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setNewSecret(null)}>Done</Button>
          </div>
        </div>
      </Modal>

      {inspecting && <DeliveriesModal hook={inspecting} onClose={() => setInspecting(null)} />}
    </div>
  );
}

function NewWebhookModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (secret: string) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>(["*"]);

  useEffect(() => {
    if (open) {
      setUrl("");
      setDescription("");
      setSelected(["*"]);
    }
  }, [open]);

  const toggleEvent = (pattern: string) => {
    setSelected((sel) => {
      if (pattern === "*") return ["*"];
      const without = sel.filter((s) => s !== "*" && s !== pattern);
      return sel.includes(pattern) ? (without.length ? without : ["*"]) : [...without, pattern];
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ data: { secret: string } }>("/webhooks", {
        method: "POST",
        body: JSON.stringify({ url, description, events: selected }),
      });
      toast("Webhook created");
      onSaved(r.data.secret);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="New webhook" open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Endpoint URL">
          <Input required type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hooks/stockflow" />
        </Field>
        <Field label="Description">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. n8n low-stock workflow" />
        </Field>
        <Field label="Events" hint="Wildcards supported — '*' for everything, 'stock.*' for a group. Fine-grained types can be set via the API.">
          <div className="flex flex-wrap gap-1.5">
            {EVENT_GROUPS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => toggleEvent(g)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                  selected.includes(g)
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create webhook"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function DeliveriesModal({ hook, onClose }: { hook: Webhook; onClose: () => void }) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(() => {
    api<{ data: Delivery[] }>(`/webhooks/${hook.id}/deliveries?limit=50`)
      .then((r) => setDeliveries(r.data))
      .catch((e) => toast(e.message, "error"));
  }, [hook.id, toast]);
  useEffect(load, [load]);

  const redeliver = async (d: Delivery) => {
    try {
      await api(`/deliveries/${d.id}/redeliver`, { method: "POST", body: "{}" });
      toast("Redelivery queued");
      setTimeout(load, 1500);
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  return (
    <Modal title={`Deliveries · ${hook.url}`} open onClose={onClose} wide>
      {deliveries.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">No deliveries yet. Trigger an event or send a test.</p>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto">
          <Table headers={["Event", "Status", "HTTP", "Attempts", "Last attempt", ""]}>
            {deliveries.map((d) => (
              <tr key={d.id} className="align-top">
                <td className="px-4 py-3">
                  <button className="text-left" onClick={() => setExpanded(expanded === d.id ? null : d.id)}>
                    <code className="text-xs font-medium text-indigo-700">{d.event_type}</code>
                  </button>
                  {expanded === d.id && (
                    <pre className="mt-2 max-h-56 max-w-lg overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                      {JSON.stringify(JSON.parse(d.payload), null, 2)}
                    </pre>
                  )}
                </td>
                <td className="px-4 py-3"><Badge status={d.status} /></td>
                <td className="px-4 py-3 text-slate-500">{d.response_status ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500">{d.attempts}</td>
                <td className="px-4 py-3 text-slate-500">{d.last_attempt_at ? timeAgo(d.last_attempt_at) : "—"}</td>
                <td className="px-4 py-3">
                  <Button variant="ghost" onClick={() => redeliver(d)} title="Redeliver">
                    <RefreshCw size={14} />
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Modal>
  );
}
