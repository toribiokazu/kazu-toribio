"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, PlugZap, RefreshCw } from "lucide-react";
import {
  api,
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Table,
  timeAgo,
  useToast,
} from "@/components/ui";

type ZohoSettings = {
  enabled: boolean;
  dc: string;
  client_id: string;
  has_client_secret: boolean;
  has_refresh_token: boolean;
  stage_created: string;
  stage_won: string;
  stage_lost: string;
};
type Sync = {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  action: string;
  status: string;
  detail: string;
  created_at: string;
};

export default function IntegrationsPage() {
  const toast = useToast();
  const [settings, setSettings] = useState<ZohoSettings | null>(null);
  const [form, setForm] = useState({
    enabled: false,
    dc: "com",
    client_id: "",
    client_secret: "",
    refresh_token: "",
    stage_created: "Estimate Created",
    stage_won: "Closed Won",
    stage_lost: "Closed Lost",
  });
  const [syncs, setSyncs] = useState<Sync[]>([]);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(() => {
    api<{ data: ZohoSettings }>("/integrations/zoho").then((r) => {
      setSettings(r.data);
      setForm((f) => ({
        ...f,
        enabled: r.data.enabled,
        dc: r.data.dc,
        client_id: r.data.client_id,
        client_secret: "",
        refresh_token: "",
        stage_created: r.data.stage_created,
        stage_won: r.data.stage_won,
        stage_lost: r.data.stage_lost,
      }));
    });
    api<{ data: Sync[] }>("/integrations/zoho/syncs?limit=50").then((r) => setSyncs(r.data));
  }, []);
  useEffect(load, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/integrations/zoho", { method: "PUT", body: JSON.stringify(form) });
      toast("Zoho settings saved");
      load();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await api<{ data: { org: string } }>("/integrations/zoho/test", { method: "POST", body: "{}" });
      toast(`Connected to Zoho org: ${r.data.org}`);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setTesting(false);
    }
  };

  const retry = async (s: Sync) => {
    try {
      await api(`/integrations/zoho/syncs/${s.id}/retry`, { method: "POST", body: "{}" });
      toast("Retry queued — check the log");
      setTimeout(load, 1200);
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Integrations"
        subtitle="Native connections that ride the same event stream as your webhooks"
      />

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <PlugZap size={20} />
            </div>
            <div>
              <h2 className="font-semibold">Zoho CRM</h2>
              <p className="text-xs text-slate-500">
                Estimates become Deals; winning or declining updates the stage; invoices sync too.
              </p>
            </div>
          </div>
          {settings && <Badge status={settings.enabled ? "active" : "inactive"}>{settings.enabled ? "enabled" : "off"}</Badge>}
        </div>

        <div className="mb-5 rounded-lg border border-slate-100 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
          <strong>Setup (once):</strong> In Zoho's{" "}
          <a href="https://api-console.zoho.com" target="_blank" rel="noreferrer" className="font-medium text-indigo-700 underline">API Console</a>,
          create a <em>Self Client</em> → Generate Code with scope{" "}
          <code className="rounded bg-white px-1">ZohoCRM.modules.ALL,ZohoCRM.settings.ALL,ZohoCRM.org.READ</code>{" "}
          → exchange the code for a <em>refresh token</em> (Zoho shows a curl command). Paste all three values below,
          test the connection, then enable. Stage names must exist in your Zoho deal pipeline — add an
          &ldquo;Estimate Created&rdquo; stage in Zoho or change the mapping below to a stage you already use.
        </div>

        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Field label="Data center">
              <Select value={form.dc} onChange={set("dc")}>
                {["com", "eu", "in", "com.au", "jp", "com.cn"].map((dc) => (
                  <option key={dc} value={dc}>zoho.{dc}</option>
                ))}
              </Select>
            </Field>
            <Field label="Client ID">
              <Input value={form.client_id} onChange={set("client_id")} placeholder="1000.XXXXXXXX" />
            </Field>
            <Field label="Client secret" hint={settings?.has_client_secret ? "Saved — leave blank to keep" : undefined}>
              <Input type="password" value={form.client_secret} onChange={set("client_secret")} placeholder={settings?.has_client_secret ? "••••••••" : ""} />
            </Field>
            <Field label="Refresh token" hint={settings?.has_refresh_token ? "Saved — leave blank to keep" : undefined}>
              <Input type="password" value={form.refresh_token} onChange={set("refresh_token")} placeholder={settings?.has_refresh_token ? "••••••••" : ""} />
            </Field>
            <Field label="Stage on estimate created">
              <Input value={form.stage_created} onChange={set("stage_created")} />
            </Field>
            <Field label="Stage on won / lost">
              <div className="flex gap-2">
                <Input value={form.stage_won} onChange={set("stage_won")} />
                <Input value={form.stage_lost} onChange={set("stage_lost")} />
              </div>
            </Field>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              className="accent-indigo-600"
            />
            Enable sync
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={test} disabled={testing}>
              <CheckCircle2 size={15} /> {testing ? "Testing…" : "Test connection"}
            </Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save settings"}</Button>
          </div>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Sync log</h2>
        {syncs.length === 0 ? (
          <EmptyState title="No syncs yet" hint="Once enabled, every estimate and invoice event appears here with its Zoho result." />
        ) : (
          <Table headers={["When", "Event", "Action", "Status", "Detail", ""]}>
            {syncs.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">{timeAgo(s.created_at)}</td>
                <td className="px-4 py-3"><code className="text-xs font-medium text-indigo-700">{s.event_type}</code></td>
                <td className="px-4 py-3 text-slate-500">{s.action}</td>
                <td className="px-4 py-3"><Badge status={s.status === "success" ? "success" : s.status === "skipped" ? "pending" : "failed"}>{s.status}</Badge></td>
                <td className="max-w-md px-4 py-3 text-xs text-slate-500">{s.detail}</td>
                <td className="px-4 py-3">
                  {s.status === "failed" && (
                    <Button variant="ghost" onClick={() => retry(s)} title="Retry">
                      <RefreshCw size={14} />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
