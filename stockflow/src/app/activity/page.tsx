"use client";

import { useCallback, useEffect, useState } from "react";
import { api, EmptyState, PageHeader, Select, Table, useToast } from "@/components/ui";

type Event = { id: string; type: string; entity_type: string; entity_id: string; payload: unknown; created_at: string };

export default function ActivityPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(() => {
    const params = new URLSearchParams({ limit: "100" });
    if (typeFilter) params.set("type", typeFilter);
    api<{ data: Event[]; event_types: string[] }>(`/events?${params}`)
      .then((r) => {
        setEvents(r.data);
        setTypes(r.event_types);
      })
      .catch((e) => toast(e.message, "error"));
  }, [typeFilter, toast]);
  useEffect(load, [load]);

  return (
    <div>
      <PageHeader
        title="Event Log"
        subtitle="Every event in the system — the same stream your webhooks receive"
        actions={
          <div className="w-60">
            <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All event types</option>
              {types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </div>
        }
      />
      {events.length === 0 ? (
        <EmptyState title="No events yet" hint="Create an item or an order and its event will show up here." />
      ) : (
        <Table headers={["When", "Type", "Entity", "Payload"]}>
          {events.map((e) => (
            <tr key={e.id} className="align-top hover:bg-slate-50">
              <td className="whitespace-nowrap px-4 py-3 text-slate-500">{new Date(e.created_at).toLocaleString()}</td>
              <td className="px-4 py-3"><code className="text-xs font-medium text-indigo-700">{e.type}</code></td>
              <td className="px-4 py-3 text-slate-500">{e.entity_type}</td>
              <td className="px-4 py-3">
                <button className="text-xs text-slate-400 underline-offset-2 hover:underline" onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
                  {expanded === e.id ? "hide" : "view"}
                </button>
                {expanded === e.id && (
                  <pre className="mt-2 max-h-72 max-w-xl overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                    {JSON.stringify(e.payload, null, 2)}
                  </pre>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
