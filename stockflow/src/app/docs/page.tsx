import { EVENT_TYPES } from "@/lib/events";

const ENDPOINTS: { method: string; path: string; desc: string }[] = [
  { method: "GET", path: "/api/v1/items", desc: "List items — ?q= search, ?type=, ?active=, ?low_stock=true, ?limit=&offset=" },
  { method: "POST", path: "/api/v1/items", desc: "Create an item (sku, name required)" },
  { method: "GET", path: "/api/v1/items/:id", desc: "Item detail with stock by location and recent movements" },
  { method: "PATCH", path: "/api/v1/items/:id", desc: "Update any item field" },
  { method: "DELETE", path: "/api/v1/items/:id", desc: "Delete an unused item" },
  { method: "GET", path: "/api/v1/locations", desc: "List locations (same CRUD shape as items)" },
  { method: "GET", path: "/api/v1/customers", desc: "List/create/update/delete customers" },
  { method: "GET", path: "/api/v1/vendors", desc: "List/create/update/delete vendors" },
  { method: "GET", path: "/api/v1/stock", desc: "Stock levels per item per location — ?item_id=, ?location_id=" },
  { method: "POST", path: "/api/v1/stock/adjust", desc: "Adjust stock: { item_id, location_id, delta, reason?, note? }" },
  { method: "POST", path: "/api/v1/stock/transfer", desc: "Transfer: { item_id, from_location_id, to_location_id, qty }" },
  { method: "GET", path: "/api/v1/stock/moves", desc: "Full movement history — ?item_id=, ?location_id=" },
  { method: "GET", path: "/api/v1/estimates", desc: "List/create estimates (quotes) — same shape as sales orders" },
  { method: "POST", path: "/api/v1/estimates/:id/convert", desc: "Win the deal — marks accepted and creates a sales order from the lines" },
  { method: "PATCH", path: "/api/v1/estimates/:id", desc: "Update, or { status: 'declined' } / { status: 'open' } to reopen" },
  { method: "GET", path: "/api/v1/sales-orders", desc: "List — ?status=, ?customer_id=, ?q=" },
  { method: "POST", path: "/api/v1/sales-orders", desc: "Create: { customer_id, location_id, lines: [{ item_id, qty, unit_price? }] }" },
  { method: "POST", path: "/api/v1/sales-orders/:id/fulfill", desc: "Ship — {} for all remaining, or { lines: [{ line_id, qty }] }" },
  { method: "PATCH", path: "/api/v1/sales-orders/:id", desc: "Update notes/due date, or { status: 'canceled' }" },
  { method: "GET", path: "/api/v1/invoices", desc: "List invoices — ?status= draft|sent|paid|void, ?q=" },
  { method: "POST", path: "/api/v1/invoices", desc: "Create from an order: { sales_order_id, due_date?, notes? } — snapshots the lines" },
  { method: "POST", path: "/api/v1/invoices/:id/send", desc: "Email the invoice — { to? } defaults to the customer's email; needs RESEND_API_KEY" },
  { method: "PATCH", path: "/api/v1/invoices/:id", desc: "Update, or { status: 'paid' } / { status: 'void' }" },
  { method: "GET", path: "/api/v1/purchase-orders", desc: "List — ?status=, ?vendor_id=, ?q=" },
  { method: "POST", path: "/api/v1/purchase-orders", desc: "Create: { vendor_id, location_id, lines: [{ item_id, qty, unit_cost? }] }" },
  { method: "POST", path: "/api/v1/purchase-orders/:id/receive", desc: "Receive — {} for all remaining, or partial lines" },
  { method: "GET", path: "/api/v1/boms", desc: "List/create BOMs: { name, output_item_id, output_qty, lines: [{ component_item_id, qty }] }" },
  { method: "GET", path: "/api/v1/work-orders", desc: "List/create work orders: { bom_id, location_id, qty }" },
  { method: "POST", path: "/api/v1/work-orders/:id/complete", desc: "Complete a build — consumes components, produces output" },
  { method: "GET", path: "/api/v1/events", desc: "Audit/event feed — ?type=, ?since= (ISO timestamp) for polling" },
  { method: "GET", path: "/api/v1/dashboard", desc: "Stats, low-stock list, recent activity" },
  { method: "GET", path: "/api/v1/webhooks", desc: "List/create/update/delete webhook subscriptions" },
  { method: "POST", path: "/api/v1/webhooks/:id/test", desc: "Send a webhook.test event now" },
  { method: "GET", path: "/api/v1/webhooks/:id/deliveries", desc: "Delivery log with response codes and bodies" },
  { method: "POST", path: "/api/v1/deliveries/:id/redeliver", desc: "Manually retry any delivery" },
  { method: "POST", path: "/api/v1/api-keys", desc: "Create API keys — { name, scope: 'full' | 'read' }" },
  { method: "POST", path: "/api/v1/import", desc: "Bulk import — { type: items|customers|vendors, rows, location_id? }; skips existing records" },
];

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-50 text-emerald-700",
  POST: "bg-indigo-50 text-indigo-700",
  PATCH: "bg-amber-50 text-amber-700",
  DELETE: "bg-rose-50 text-rose-700",
};

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 text-[13px] leading-relaxed text-slate-100">
      {children}
    </pre>
  );
}

export default function DocsPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">API Documentation</h1>
      <p className="mt-1 text-sm text-slate-500">
        Everything the UI does, you can do over HTTP — the UI itself runs on this API.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Authentication</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Create a key under <a href="/settings/api-keys" className="font-medium text-indigo-700 underline">Settings → API Keys</a> and
        send it as a bearer token. Read-only keys can only call GET endpoints.
      </p>
      <div className="mt-3">
        <Code>{`curl https://your-host/api/v1/items \\
  -H "Authorization: Bearer sfk_your_key_here"`}</Code>
      </div>

      <h2 className="mt-8 text-lg font-semibold">Conventions</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-600">
        <li>All bodies are JSON; successful responses wrap results in <code className="text-xs">{`{ "data": ... }`}</code>, lists add <code className="text-xs">total / limit / offset</code>.</li>
        <li>Errors return <code className="text-xs">{`{ "error": { "message": "..." } }`}</code> with a meaningful HTTP status (400 validation, 401 auth, 404 missing, 409 conflict, 422 business rule).</li>
        <li>List endpoints accept <code className="text-xs">?limit=</code> (max 200) and <code className="text-xs">?offset=</code>; most accept <code className="text-xs">?q=</code> for search.</li>
        <li>PATCH is a partial update — send only the fields you want to change.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">Endpoints</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {ENDPOINTS.map((e) => (
              <tr key={`${e.method} ${e.path}`}>
                <td className="w-20 px-4 py-2.5">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${METHOD_COLORS[e.method]}`}>{e.method}</span>
                </td>
                <td className="whitespace-nowrap px-2 py-2.5 font-mono text-xs">{e.path}</td>
                <td className="px-4 py-2.5 text-slate-500">{e.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-lg font-semibold">Webhooks</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Subscribe any URL to events under <a href="/settings/webhooks" className="font-medium text-indigo-700 underline">Settings → Webhooks</a>.
        Subscriptions take exact event types, group wildcards like <code className="text-xs">stock.*</code>, or <code className="text-xs">*</code> for
        everything. Failed deliveries retry automatically (3 retries with backoff) and can be redelivered manually from the
        delivery log at any time.
      </p>
      <p className="mt-3 text-sm font-medium text-slate-700">Delivery format</p>
      <div className="mt-2">
        <Code>{`POST <your-url>
Content-Type: application/json
X-StockFlow-Event: stock.low
X-StockFlow-Delivery: del_9f2c4a...
X-StockFlow-Signature: t=1720800000,v1=hex(hmac_sha256(secret, "{t}.{body}"))

{
  "id": "evt_1a2b3c...",
  "type": "stock.low",
  "created_at": "2026-07-12T09:30:00.000Z",
  "data": { "item_id": "itm_...", "sku": "WID-001", "on_hand": 3, "reorder_point": 5 }
}`}</Code>
      </div>
      <p className="mt-3 text-sm font-medium text-slate-700">Verifying signatures (Node.js)</p>
      <div className="mt-2">
        <Code>{`import crypto from "node:crypto";

function verify(secret, signatureHeader, rawBody) {
  const { t, v1 } = Object.fromEntries(
    signatureHeader.split(",").map((p) => p.split("="))
  );
  const expected = crypto
    .createHmac("sha256", secret)
    .update(\`\${t}.\${rawBody}\`)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}`}</Code>
      </div>

      <h2 className="mt-8 text-lg font-semibold">Event types</h2>
      <div className="mt-3 flex flex-wrap gap-1.5 pb-12">
        {EVENT_TYPES.map((t) => (
          <code key={t} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">{t}</code>
        ))}
      </div>
    </div>
  );
}
