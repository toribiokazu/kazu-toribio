import { getDb } from "./db";
import { id as makeId, now } from "./util";

/**
 * QuickBooks Online sync.
 *
 * StockFlow events drive one-way sync into QuickBooks:
 *   estimate.created  -> create a QBO Estimate (TxnStatus: Pending)
 *   estimate.accepted -> TxnStatus: Accepted
 *   estimate.declined -> TxnStatus: Rejected
 *   invoice.created   -> create a QBO Invoice
 *   invoice.paid      -> record a QBO Payment against the invoice
 *   invoice.voided    -> void the QBO invoice
 *   invoice.sent      -> note on the QBO invoice
 *
 * Customers are matched by display name, items by SKU; both are created in
 * QuickBooks when missing. Auth is standard QBO OAuth2 — client id/secret,
 * realm (company) id, and a refresh token. QuickBooks ROTATES refresh
 * tokens on every refresh, so the newest one is persisted automatically.
 */

export type QboConfig = {
  enabled: boolean;
  environment: "sandbox" | "production";
  client_id: string;
  client_secret: string;
  refresh_token: string;
  realm_id: string;
  // Test/advanced overrides.
  api_base?: string;
  token_url?: string;
};

const DEFAULTS: QboConfig = {
  enabled: false,
  environment: "production",
  client_id: "",
  client_secret: "",
  refresh_token: "",
  realm_id: "",
};

export function getQboConfig(): QboConfig {
  const row = getDb().prepare("SELECT config FROM integration_settings WHERE provider = 'quickbooks'").get() as
    | { config: string }
    | undefined;
  if (!row) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(row.config) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveQboConfig(patch: Partial<QboConfig>): QboConfig {
  const merged = { ...getQboConfig(), ...patch };
  getDb()
    .prepare(
      `INSERT INTO integration_settings (provider, config, updated_at) VALUES ('quickbooks', ?, ?)
       ON CONFLICT(provider) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at`
    )
    .run(JSON.stringify(merged), now());
  if (patch.client_id || patch.client_secret || patch.refresh_token) tokenCache.token = "";
  return merged;
}

function apiBase(cfg: QboConfig): string {
  if (cfg.api_base) return cfg.api_base;
  return cfg.environment === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";
}
function tokenUrl(cfg: QboConfig): string {
  return cfg.token_url || "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
}

const tokenCache = { token: "", expiresAt: 0 };

async function accessToken(cfg: QboConfig): Promise<string> {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token;
  const res = await fetch(tokenUrl(cfg), {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${cfg.client_id}:${cfg.client_secret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: cfg.refresh_token }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !body.access_token)
    throw new Error(`QuickBooks token refresh failed: ${body.error || `HTTP ${res.status}`}`);
  // QBO rotates refresh tokens; losing the new one would break the connection.
  // Persist BEFORE touching the cache — saveQboConfig invalidates it.
  if (body.refresh_token && body.refresh_token !== cfg.refresh_token) {
    saveQboConfig({ refresh_token: body.refresh_token });
  }
  tokenCache.token = body.access_token;
  tokenCache.expiresAt = Date.now() + (body.expires_in ?? 3600) * 1000;
  return body.access_token;
}

type QboRecord = Record<string, unknown>;

async function qboCall(cfg: QboConfig, method: "GET" | "POST", path: string, body?: unknown): Promise<QboRecord> {
  const token = await accessToken(cfg);
  const res = await fetch(`${apiBase(cfg)}/v3/company/${cfg.realm_id}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as QboRecord;
  if (!res.ok) {
    const fault = json.Fault as { Error?: { Message?: string; Detail?: string }[] } | undefined;
    const err = fault?.Error?.[0];
    throw new Error(`QuickBooks ${method} ${path} failed: ${err?.Message || `HTTP ${res.status}`}${err?.Detail ? ` — ${err.Detail}` : ""}`);
  }
  return json;
}

async function qboQuery(cfg: QboConfig, query: string): Promise<QboRecord[]> {
  const response = await qboCall(cfg, "GET", `/query?query=${encodeURIComponent(query)}`);
  const qr = response.QueryResponse as Record<string, unknown> | undefined;
  if (!qr) return [];
  for (const value of Object.values(qr)) {
    if (Array.isArray(value)) return value as QboRecord[];
  }
  return [];
}

const q = (s: string) => s.replace(/'/g, "\\'");

function getLink(entityType: string, entityId: string): string | undefined {
  const row = getDb()
    .prepare(
      "SELECT external_id FROM integration_links WHERE provider = 'quickbooks' AND entity_type = ? AND entity_id = ?"
    )
    .get(entityType, entityId) as { external_id: string } | undefined;
  return row?.external_id;
}

function saveLink(entityType: string, entityId: string, module: string, externalId: string): void {
  getDb()
    .prepare(
      `INSERT INTO integration_links (id, provider, entity_type, entity_id, external_module, external_id, created_at)
       VALUES (?, 'quickbooks', ?, ?, ?, ?, ?)
       ON CONFLICT(provider, entity_type, entity_id) DO UPDATE SET external_id = excluded.external_id`
    )
    .run(makeId("lnk"), entityType, entityId, module, externalId, now());
}

async function ensureCustomer(cfg: QboConfig, name: string, email: string): Promise<string> {
  const key = email || name;
  const cached = getLink("customer", key);
  if (cached) return cached;
  const found = await qboQuery(cfg, `select Id from Customer where DisplayName = '${q(name)}'`);
  let customerId = (found[0]?.Id as string) || "";
  if (!customerId) {
    const created = await qboCall(cfg, "POST", "/customer", {
      DisplayName: name,
      ...(email ? { PrimaryEmailAddr: { Address: email } } : {}),
    });
    customerId = ((created.Customer as QboRecord)?.Id as string) || "";
  }
  if (!customerId) throw new Error(`Could not create QuickBooks customer for ${name}`);
  saveLink("customer", key, "Customer", customerId);
  return customerId;
}

/** First income account in the company, needed to create items. */
async function incomeAccount(cfg: QboConfig): Promise<string> {
  const cached = getLink("account", "income");
  if (cached) return cached;
  const found = await qboQuery(cfg, "select Id from Account where AccountType = 'Income' maxresults 1");
  const accountId = (found[0]?.Id as string) || "";
  if (!accountId)
    throw new Error("No income account found in QuickBooks — create one (e.g. 'Sales') and retry");
  saveLink("account", "income", "Account", accountId);
  return accountId;
}

async function ensureItem(cfg: QboConfig, sku: string, name: string, price: number): Promise<string> {
  const cached = getLink("qbo_item", sku);
  if (cached) return cached;
  const found = await qboQuery(cfg, `select Id from Item where Sku = '${q(sku)}'`);
  let itemId = (found[0]?.Id as string) || "";
  if (!itemId) {
    const created = await qboCall(cfg, "POST", "/item", {
      Name: name ? `${name} (${sku})` : sku,
      Sku: sku,
      Type: "NonInventory",
      UnitPrice: price,
      IncomeAccountRef: { value: await incomeAccount(cfg) },
    });
    itemId = ((created.Item as QboRecord)?.Id as string) || "";
  }
  if (!itemId) throw new Error(`Could not create QuickBooks item for SKU ${sku}`);
  saveLink("qbo_item", sku, "Item", itemId);
  return itemId;
}

type LinePayload = { sku: string; item_name?: string; description?: string; qty: number; unit_price: number };

async function salesLines(cfg: QboConfig, lines: LinePayload[]) {
  const out = [];
  for (const line of lines) {
    const itemId = await ensureItem(cfg, line.sku, line.item_name || line.description || line.sku, line.unit_price);
    out.push({
      DetailType: "SalesItemLineDetail",
      Amount: line.qty * line.unit_price,
      Description: line.description || line.item_name || line.sku,
      SalesItemLineDetail: { ItemRef: { value: itemId }, Qty: line.qty, UnitPrice: line.unit_price },
    });
  }
  return out;
}

type EstimatePayload = {
  id: string;
  number: string;
  total: number;
  customer_name: string;
  customer_email?: string;
  order_date?: string;
  expiry_date?: string;
  notes?: string;
  lines: LinePayload[];
};

async function createQboEstimate(cfg: QboConfig, estimate: EstimatePayload, txnStatus: string): Promise<string> {
  const customerId = await ensureCustomer(cfg, estimate.customer_name, estimate.customer_email || "");
  const created = await qboCall(cfg, "POST", "/estimate", {
    DocNumber: estimate.number,
    TxnStatus: txnStatus,
    CustomerRef: { value: customerId },
    ...(estimate.order_date ? { TxnDate: estimate.order_date } : {}),
    ...(estimate.expiry_date ? { ExpirationDate: estimate.expiry_date } : {}),
    ...(estimate.notes ? { PrivateNote: estimate.notes } : {}),
    Line: await salesLines(cfg, estimate.lines),
  });
  const estimateId = ((created.Estimate as QboRecord)?.Id as string) || "";
  if (!estimateId) throw new Error(`QuickBooks did not return an estimate id for ${estimate.number}`);
  saveLink("estimate", estimate.id, "Estimate", estimateId);
  return estimateId;
}

/** Sparse updates need the record's current SyncToken. */
async function syncTokenOf(cfg: QboConfig, entity: "estimate" | "invoice", qboId: string): Promise<string> {
  const response = await qboCall(cfg, "GET", `/${entity}/${qboId}`);
  const record = response[entity === "estimate" ? "Estimate" : "Invoice"] as QboRecord | undefined;
  return (record?.SyncToken as string) ?? "0";
}

type InvoicePayload = {
  id: string;
  number: string;
  status: string;
  total: number;
  issue_date: string;
  due_date?: string;
  customer_name: string;
  customer_email?: string;
  order_number?: string;
  lines: LinePayload[];
};

async function createQboInvoice(cfg: QboConfig, invoice: InvoicePayload): Promise<string> {
  const customerId = await ensureCustomer(cfg, invoice.customer_name, invoice.customer_email || "");
  const created = await qboCall(cfg, "POST", "/invoice", {
    DocNumber: invoice.number,
    CustomerRef: { value: customerId },
    TxnDate: invoice.issue_date,
    ...(invoice.due_date ? { DueDate: invoice.due_date } : {}),
    PrivateNote: `From StockFlow (order ${invoice.order_number || "?"})`,
    Line: await salesLines(cfg, invoice.lines),
  });
  const invoiceId = ((created.Invoice as QboRecord)?.Id as string) || "";
  if (!invoiceId) throw new Error(`QuickBooks did not return an invoice id for ${invoice.number}`);
  saveLink("invoice", invoice.id, "Invoice", invoiceId);
  return invoiceId;
}

const HANDLED = new Set([
  "estimate.created",
  "estimate.accepted",
  "estimate.declined",
  "invoice.created",
  "invoice.sent",
  "invoice.paid",
  "invoice.voided",
]);

function logSync(
  eventType: string,
  entityType: string,
  entityId: string,
  action: string,
  status: "success" | "failed" | "skipped",
  detail: string,
  payload: unknown
): void {
  getDb()
    .prepare(
      "INSERT INTO integration_syncs (id, provider, event_type, entity_type, entity_id, action, status, detail, payload, created_at) VALUES (?, 'quickbooks', ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(makeId("syn"), eventType, entityType, entityId, action, status, detail, JSON.stringify(payload ?? {}), now());
}

/** Fire-and-forget entry point called from emitEvent. Never throws. */
export async function syncToQuickBooks(
  eventType: string,
  entityType: string,
  entityId: string,
  payload: unknown
): Promise<void> {
  try {
    if (!HANDLED.has(eventType)) return;
    const cfg = getQboConfig();
    if (!cfg.enabled) return;
    if (!cfg.client_id || !cfg.client_secret || !cfg.refresh_token || !cfg.realm_id) {
      logSync(eventType, entityType, entityId, "sync", "skipped", "QuickBooks credentials are incomplete", payload);
      return;
    }
    await runHandler(cfg, eventType, entityId, payload);
  } catch (err) {
    logSync(eventType, entityType, entityId, "sync", "failed", err instanceof Error ? err.message : String(err), payload);
  }
}

async function runHandler(cfg: QboConfig, eventType: string, entityId: string, payload: unknown): Promise<void> {
  if (eventType.startsWith("estimate.")) {
    const estimate = payload as EstimatePayload;
    if (eventType === "estimate.created") {
      const qboId = await createQboEstimate(cfg, estimate, "Pending");
      logSync(eventType, "estimate", entityId, "estimate.create", "success", `Created QuickBooks estimate ${qboId} (Pending)`, payload);
      return;
    }
    const txnStatus = eventType === "estimate.accepted" ? "Accepted" : "Rejected";
    let qboId = getLink("estimate", entityId);
    if (!qboId) {
      qboId = await createQboEstimate(cfg, estimate, txnStatus);
      logSync(eventType, "estimate", entityId, "estimate.create", "success", `Created QuickBooks estimate ${qboId} directly as ${txnStatus}`, payload);
      return;
    }
    await qboCall(cfg, "POST", "/estimate", {
      Id: qboId,
      SyncToken: await syncTokenOf(cfg, "estimate", qboId),
      sparse: true,
      TxnStatus: txnStatus,
    });
    logSync(eventType, "estimate", entityId, "estimate.update", "success", `QuickBooks estimate ${qboId} marked ${txnStatus}`, payload);
    return;
  }

  const invoice = payload as InvoicePayload;
  if (eventType === "invoice.created") {
    const qboId = await createQboInvoice(cfg, invoice);
    logSync(eventType, "invoice", entityId, "invoice.create", "success", `Created QuickBooks invoice ${qboId}`, payload);
    return;
  }
  let qboId = getLink("invoice", entityId);
  if (!qboId) {
    qboId = await createQboInvoice(cfg, invoice);
    logSync(eventType, "invoice", entityId, "invoice.create", "success", `Created QuickBooks invoice ${qboId} (was missing)`, payload);
  }
  if (eventType === "invoice.paid") {
    const customerId = await ensureCustomer(cfg, invoice.customer_name, invoice.customer_email || "");
    const payment = await qboCall(cfg, "POST", "/payment", {
      CustomerRef: { value: customerId },
      TotalAmt: invoice.total,
      Line: [{ Amount: invoice.total, LinkedTxn: [{ TxnId: qboId, TxnType: "Invoice" }] }],
    });
    const paymentId = ((payment.Payment as QboRecord)?.Id as string) || "?";
    logSync(eventType, "invoice", entityId, "payment.create", "success", `Recorded QuickBooks payment ${paymentId} against invoice ${qboId}`, payload);
    return;
  }
  if (eventType === "invoice.voided") {
    await qboCall(cfg, "POST", `/invoice?operation=void`, {
      Id: qboId,
      SyncToken: await syncTokenOf(cfg, "invoice", qboId),
    });
    logSync(eventType, "invoice", entityId, "invoice.void", "success", `Voided QuickBooks invoice ${qboId}`, payload);
    return;
  }
  // invoice.sent: annotate
  await qboCall(cfg, "POST", "/invoice", {
    Id: qboId,
    SyncToken: await syncTokenOf(cfg, "invoice", qboId),
    sparse: true,
    PrivateNote: `From StockFlow (order ${invoice.order_number || "?"}) — sent to customer ${now()}`,
  });
  logSync(eventType, "invoice", entityId, "invoice.update", "success", `QuickBooks invoice ${qboId} noted as sent`, payload);
}

/** Re-run a failed sync from the log. */
export async function retryQboSync(syncId: string): Promise<void> {
  const row = getDb().prepare("SELECT * FROM integration_syncs WHERE id = ? AND provider = 'quickbooks'").get(syncId) as
    | { event_type: string; entity_type: string; entity_id: string; payload: string }
    | undefined;
  if (!row) throw new Error(`Sync record not found: ${syncId}`);
  await syncToQuickBooks(row.event_type, row.entity_type, row.entity_id, JSON.parse(row.payload || "{}"));
}

/** Verify credentials by fetching company info. Returns the company name. */
export async function testQboConnection(): Promise<string> {
  const cfg = getQboConfig();
  if (!cfg.client_id || !cfg.client_secret || !cfg.refresh_token || !cfg.realm_id)
    throw new Error("Fill in client ID, client secret, refresh token, and company (realm) ID first");
  tokenCache.token = "";
  const response = await qboCall(cfg, "GET", `/companyinfo/${cfg.realm_id}`);
  const info = response.CompanyInfo as { CompanyName?: string } | undefined;
  return info?.CompanyName || "connected";
}
