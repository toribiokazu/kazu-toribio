# StockFlow

**API-first inventory management** — the core feature set of SOS Inventory, rebuilt around three priorities: a flexible REST API, first-class webhooks, and a UI people actually enjoy using.

Every single thing the UI does goes through the public REST API (the UI is just another API client), so anything you can click, you can automate.

## Features

**Sales pipeline**
- Estimates (quotes) with win/decline — winning one converts it to a sales order in one click
- Invoices created from sales orders: printable/PDF-ready document, email sending (via Resend), mark paid, void
- Dashboard "Last 7 days" metrics: estimates created, deals won, conversion rate, gross profit on shipped goods, units shipped, shipment fulfillment rate

**Inventory operations**
- Items catalog — inventory, non-inventory, and service types; SKU, barcode, category, unit of measure, cost/price, reorder points
- Multi-location stock tracking (warehouses, storefronts, vans…)
- Adjustments with reasons (recount, damage, shrinkage…), transfers between locations, and a full movement audit trail
- Sales orders with partial or full fulfillment (ships stock out)
- Purchase orders with partial or full receiving (brings stock in)
- Manufacturing: bills of materials + work orders — completing a build atomically consumes components and produces the output item
- Reports: inventory valuation, reorder report, low-stock dashboard
- Oversell protection: any operation that would drive stock negative is rejected atomically

**Migration & sandboxing**
- **Import Data** page: upload CSV exports from SOS Inventory (or anything else) for items, customers, and vendors — auto-matched columns, preview, opening stock quantities into a chosen location, duplicate-safe re-runs
- **Password gate**: set `STOCKFLOW_PASSWORD` and the whole UI + API sits behind a login — safe to hand a sandbox URL to a client
- Docker image + configs for Railway/Fly/Render/VPS — see `DEPLOY.md`

**Integrations**
- Native **Zoho CRM sync** (Settings → Integrations): creating an estimate creates a Deal in your chosen stage ("Estimate Created" by default), winning/declining it moves the Deal to Closed Won/Lost, and invoices sync to Zoho's Invoices module (contacts and products upserted automatically by email/SKU)
- Full sync log with per-event results and one-click retry of failures
- Anything else connects through the generic webhooks + REST API (Zapier, n8n, Make, custom code)

**Developer platform**
- REST API at `/api/v1` — JSON in/out, uniform `{ data }` / `{ error }` envelopes, pagination, search and filters on every list endpoint
- API keys with `full` or `read`-only scope; SHA-256-hashed at rest, shown once, revocable
- Webhooks: subscribe any URL to exact event types, group wildcards (`stock.*`), or everything (`*`)
- Deliveries signed with HMAC-SHA256 (`X-StockFlow-Signature: t=…,v1=…`, Stripe-style timestamped signatures), retried automatically with backoff, fully logged with response codes/bodies, manually redeliverable
- 27 event types (`item.created`, `stock.low`, `sales_order.fulfilled`, …) plus a pollable `/api/v1/events` audit feed with `?since=` cursor
- In-app API docs at `/docs`, event log viewer at `/activity`, one-click webhook test pings

## Quick start

```bash
bun install        # or npm install
bun run build      # or npm run build
bun run start      # or npm run start
# → http://localhost:3000

# optional demo data (run while the app is up):
bun run seed
```

Development mode: `bun run dev`.

Hosting a sandbox for someone else? Set `STOCKFLOW_PASSWORD` to enable the login gate, and read `DEPLOY.md` for hosting options (Railway/Fly/VPS/free tiers) — the app needs a host with a persistent disk.

The database is a zero-config embedded SQLite file at `data/stockflow.db` (set `STOCKFLOW_DATA_DIR` to relocate it). It is created automatically on first request — there is no migration step. Requires Node 22+ (uses the built-in `node:sqlite`).

## API in 30 seconds

Create a key under **Settings → API Keys**, then:

```bash
# list items
curl http://localhost:3000/api/v1/items -H "Authorization: Bearer sfk_…"

# create an item
curl -X POST http://localhost:3000/api/v1/items \
  -H "Authorization: Bearer sfk_…" -H "content-type: application/json" \
  -d '{"sku":"WID-01","name":"Widget","price":29.99,"reorder_point":5}'

# subscribe a webhook to low-stock + order events
curl -X POST http://localhost:3000/api/v1/webhooks \
  -H "Authorization: Bearer sfk_…" -H "content-type: application/json" \
  -d '{"url":"https://example.com/hook","events":["stock.low","sales_order.*"]}'
```

Full endpoint reference, webhook payload format, and a signature-verification snippet live in the app at **`/docs`**.

## Architecture notes

- **Next.js 15 (App Router) + React 19 + Tailwind 4**; API route handlers under `src/app/api/v1`
- **`node:sqlite`** embedded database — no ORM, no external services, transactional stock math (`src/lib/db.ts`, `src/lib/stock.ts`)
- **Event bus** (`src/lib/events.ts`): every mutation records an event, fans out to matching webhook subscriptions, and delivers asynchronously so API responses never wait on receivers
- The browser UI authenticates via same-origin (`Sec-Fetch-Site`) and calls the very same `/api/v1` endpoints external integrations use; external callers always need a bearer key
- Single-tenant by design: deploy it behind your own auth proxy (Cloudflare Access, Tailscale, a VPN) or add an auth layer before exposing the UI publicly

## What's deliberately not here (yet)

User accounts/roles, lot & serial tracking, multi-currency, and hosted deployment recipes. The schema and event system were built to make these straightforward follow-ups.
