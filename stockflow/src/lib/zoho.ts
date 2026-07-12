import { getDb } from "./db";
import { id as makeId, now, today } from "./util";

/**
 * Zoho CRM sync.
 *
 * StockFlow events drive one-way sync into Zoho CRM:
 *   estimate.created  -> create a Deal (stage: cfg.stage_created)
 *   estimate.accepted -> update the Deal to cfg.stage_won
 *   estimate.declined -> update the Deal to cfg.stage_lost
 *   invoice.created   -> create an Invoice (products upserted by SKU)
 *   invoice.sent/paid/voided -> update the Invoice's status note
 *
 * Auth is Zoho's "Self Client" OAuth flow: the user pastes client id/secret
 * and a refresh token in Settings -> Integrations. Access tokens are cached
 * in memory. Every sync attempt (success, failure, or skip) is written to
 * integration_syncs, and failures can be retried from the UI.
 */

export type ZohoConfig = {
  enabled: boolean;
  dc: string; // com | eu | in | com.au | jp | com.cn
  client_id: string;
  client_secret: string;
  refresh_token: string;
  stage_created: string;
  stage_won: string;
  stage_lost: string;
  // Test/advanced overrides; normally derived from dc.
  api_base?: string;
  accounts_base?: string;
};

const DEFAULTS: ZohoConfig = {
  enabled: false,
  dc: "com",
  client_id: "",
  client_secret: "",
  refresh_token: "",
  stage_created: "Estimate Created",
  stage_won: "Closed Won",
  stage_lost: "Closed Lost",
};

export function getZohoConfig(): ZohoConfig {
  const row = getDb().prepare("SELECT config FROM integration_settings WHERE provider = 'zoho'").get() as
    | { config: string }
    | undefined;
  if (!row) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(row.config) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveZohoConfig(patch: Partial<ZohoConfig>): ZohoConfig {
  const merged = { ...getZohoConfig(), ...patch };
  getDb()
    .prepare(
      `INSERT INTO integration_settings (provider, config, updated_at) VALUES ('zoho', ?, ?)
       ON CONFLICT(provider) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at`
    )
    .run(JSON.stringify(merged), now());
  tokenCache.token = ""; // credentials may have changed
  return merged;
}

function apiBase(cfg: ZohoConfig): string {
  return cfg.api_base || `https://www.zohoapis.${cfg.dc}`;
}
function accountsBase(cfg: ZohoConfig): string {
  return cfg.accounts_base || `https://accounts.zoho.${cfg.dc}`;
}

const tokenCache = { token: "", expiresAt: 0 };

async function accessToken(cfg: ZohoConfig): Promise<string> {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token;
  const params = new URLSearchParams({
    refresh_token: cfg.refresh_token,
    client_id: cfg.client_id,
    client_secret: cfg.client_secret,
    grant_type: "refresh_token",
  });
  const res = await fetch(`${accountsBase(cfg)}/oauth/v2/token?${params}`, { method: "POST" });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !body.access_token)
    throw new Error(`Zoho token refresh failed: ${body.error || `HTTP ${res.status}`}`);
  tokenCache.token = body.access_token;
  tokenCache.expiresAt = Date.now() + (body.expires_in ?? 3600) * 1000;
  return tokenCache.token;
}

type ZohoRecord = Record<string, unknown>;

async function zohoCall(
  cfg: ZohoConfig,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown
): Promise<ZohoRecord> {
  const token = await accessToken(cfg);
  const res = await fetch(`${apiBase(cfg)}${path}`, {
    method,
    headers: {
      authorization: `Zoho-oauthtoken ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as ZohoRecord;
  if (!res.ok) {
    const data = (json.data as { message?: string }[] | undefined)?.[0];
    throw new Error(`Zoho ${method} ${path} failed: ${data?.message || json.message || `HTTP ${res.status}`}`);
  }
  return json;
}

/** Extract the record id from a create/upsert response. */
function recordId(response: ZohoRecord, context: string): string {
  const data = response.data as { code?: string; details?: { id?: string }; message?: string }[] | undefined;
  const first = data?.[0];
  if (!first || (first.code !== "SUCCESS" && first.code !== "DUPLICATE_DATA") || !first.details?.id)
    throw new Error(`Zoho rejected ${context}: ${first?.message || JSON.stringify(response).slice(0, 200)}`);
  return first.details.id;
}

function getLink(entityType: string, entityId: string): string | undefined {
  const row = getDb()
    .prepare(
      "SELECT external_id FROM integration_links WHERE provider = 'zoho' AND entity_type = ? AND entity_id = ?"
    )
    .get(entityType, entityId) as { external_id: string } | undefined;
  return row?.external_id;
}

function saveLink(entityType: string, entityId: string, module: string, externalId: string): void {
  getDb()
    .prepare(
      `INSERT INTO integration_links (id, provider, entity_type, entity_id, external_module, external_id, created_at)
       VALUES (?, 'zoho', ?, ?, ?, ?, ?)
       ON CONFLICT(provider, entity_type, entity_id) DO UPDATE SET external_id = excluded.external_id`
    )
    .run(makeId("lnk"), entityType, entityId, module, externalId, now());
}

/** Upsert a Zoho Contact by email; returns its id, or undefined when no email. */
async function ensureContact(cfg: ZohoConfig, name: string, email: string): Promise<string | undefined> {
  if (!email) return undefined;
  const cached = getLink("contact", email);
  if (cached) return cached;
  const [first, ...rest] = name.split(" ");
  const response = await zohoCall(cfg, "POST", "/crm/v2/Contacts/upsert", {
    data: [{ First_Name: rest.length ? first : "", Last_Name: rest.length ? rest.join(" ") : first || name, Email: email }],
    duplicate_check_fields: ["Email"],
  });
  const contactId = recordId(response, `contact upsert for ${email}`);
  saveLink("contact", email, "Contacts", contactId);
  return contactId;
}

/** Upsert a Zoho Product by SKU (Product_Code); returns its id. */
async function ensureProduct(cfg: ZohoConfig, sku: string, name: string, price: number): Promise<string> {
  const cached = getLink("product", sku);
  if (cached) return cached;
  const response = await zohoCall(cfg, "POST", "/crm/v2/Products/upsert", {
    data: [{ Product_Name: name || sku, Product_Code: sku, Unit_Price: price }],
    duplicate_check_fields: ["Product_Code"],
  });
  const productId = recordId(response, `product upsert for ${sku}`);
  saveLink("product", sku, "Products", productId);
  return productId;
}

type EstimatePayload = {
  id: string;
  number: string;
  total: number;
  customer_name: string;
  customer_email?: string;
  expiry_date?: string;
  notes?: string;
};

async function createDeal(cfg: ZohoConfig, estimate: EstimatePayload, stage: string): Promise<string> {
  const contactId = await ensureContact(cfg, estimate.customer_name, estimate.customer_email || "");
  const response = await zohoCall(cfg, "POST", "/crm/v2/Deals", {
    data: [
      {
        Deal_Name: `${estimate.number} — ${estimate.customer_name}`,
        Amount: estimate.total,
        Stage: stage,
        Closing_Date: estimate.expiry_date || today(),
        Description: `Estimate ${estimate.number} created in StockFlow${estimate.notes ? `\n${estimate.notes}` : ""}`,
        ...(contactId ? { Contact_Name: { id: contactId } } : {}),
      },
    ],
  });
  const dealId = recordId(response, `deal for ${estimate.number}`);
  saveLink("estimate", estimate.id, "Deals", dealId);
  return dealId;
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
  lines: { sku: string; description: string; qty: number; unit_price: number }[];
};

async function createZohoInvoice(cfg: ZohoConfig, invoice: InvoicePayload): Promise<string> {
  const contactId = await ensureContact(cfg, invoice.customer_name, invoice.customer_email || "");
  const productDetails = [];
  for (const line of invoice.lines) {
    const productId = await ensureProduct(cfg, line.sku, line.description, line.unit_price);
    productDetails.push({
      product: { id: productId },
      quantity: line.qty,
      list_price: line.unit_price,
    });
  }
  const response = await zohoCall(cfg, "POST", "/crm/v2/Invoices", {
    data: [
      {
        Subject: `${invoice.number} — ${invoice.customer_name}`,
        Invoice_Date: invoice.issue_date,
        ...(invoice.due_date ? { Due_Date: invoice.due_date } : {}),
        Description: `Invoice ${invoice.number} (order ${invoice.order_number || "?"}) from StockFlow — status: ${invoice.status}`,
        Product_Details: productDetails,
        ...(contactId ? { Contact_Name: { id: contactId } } : {}),
      },
    ],
  });
  const invoiceId = recordId(response, `invoice ${invoice.number}`);
  saveLink("invoice", invoice.id, "Invoices", invoiceId);
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
      "INSERT INTO integration_syncs (id, provider, event_type, entity_type, entity_id, action, status, detail, payload, created_at) VALUES (?, 'zoho', ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(makeId("syn"), eventType, entityType, entityId, action, status, detail, JSON.stringify(payload ?? {}), now());
}

/** Fire-and-forget entry point called from emitEvent. Never throws. */
export async function syncToZoho(
  eventType: string,
  entityType: string,
  entityId: string,
  payload: unknown
): Promise<void> {
  try {
    if (!HANDLED.has(eventType)) return;
    const cfg = getZohoConfig();
    if (!cfg.enabled) return;
    if (!cfg.client_id || !cfg.client_secret || !cfg.refresh_token) {
      logSync(eventType, entityType, entityId, "sync", "skipped", "Zoho credentials are incomplete", payload);
      return;
    }
    await runHandler(cfg, eventType, entityId, payload);
  } catch (err) {
    logSync(eventType, entityType, entityId, "sync", "failed", err instanceof Error ? err.message : String(err), payload);
  }
}

async function runHandler(cfg: ZohoConfig, eventType: string, entityId: string, payload: unknown): Promise<void> {
  if (eventType.startsWith("estimate.")) {
    const estimate = payload as EstimatePayload;
    if (eventType === "estimate.created") {
      const dealId = await createDeal(cfg, estimate, cfg.stage_created);
      logSync(eventType, "estimate", entityId, "deal.create", "success", `Created Zoho deal ${dealId} (stage: ${cfg.stage_created})`, payload);
      return;
    }
    const stage = eventType === "estimate.accepted" ? cfg.stage_won : cfg.stage_lost;
    let dealId = getLink("estimate", entityId);
    if (!dealId) {
      // Estimate predates the integration: create the deal directly in its final stage.
      dealId = await createDeal(cfg, estimate, stage);
      logSync(eventType, "estimate", entityId, "deal.create", "success", `Created Zoho deal ${dealId} directly in stage ${stage}`, payload);
      return;
    }
    await zohoCall(cfg, "PUT", `/crm/v2/Deals/${dealId}`, {
      data: [{ Stage: stage, ...(eventType === "estimate.accepted" ? { Amount: estimate.total } : {}) }],
    });
    logSync(eventType, "estimate", entityId, "deal.update", "success", `Zoho deal ${dealId} moved to ${stage}`, payload);
    return;
  }

  const invoice = payload as InvoicePayload;
  if (eventType === "invoice.created") {
    const invoiceId = await createZohoInvoice(cfg, invoice);
    logSync(eventType, "invoice", entityId, "invoice.create", "success", `Created Zoho invoice ${invoiceId}`, payload);
    return;
  }
  let invoiceId = getLink("invoice", entityId);
  if (!invoiceId) {
    invoiceId = await createZohoInvoice(cfg, invoice);
    logSync(eventType, "invoice", entityId, "invoice.create", "success", `Created Zoho invoice ${invoiceId} (was missing)`, payload);
  }
  const statusLabel = eventType.split(".")[1]; // sent | paid | voided
  await zohoCall(cfg, "PUT", `/crm/v2/Invoices/${invoiceId}`, {
    data: [
      {
        Description: `Invoice ${invoice.number} (order ${invoice.order_number || "?"}) from StockFlow — status: ${statusLabel} (updated ${now()})`,
      },
    ],
  });
  logSync(eventType, "invoice", entityId, "invoice.update", "success", `Zoho invoice ${invoiceId} marked ${statusLabel}`, payload);
}

/** Re-run a failed sync from the log. */
export async function retrySync(syncId: string): Promise<void> {
  const row = getDb().prepare("SELECT * FROM integration_syncs WHERE id = ?").get(syncId) as
    | { event_type: string; entity_type: string; entity_id: string; payload: string }
    | undefined;
  if (!row) throw new Error(`Sync record not found: ${syncId}`);
  await syncToZoho(row.event_type, row.entity_type, row.entity_id, JSON.parse(row.payload || "{}"));
}

/** Verify credentials by fetching org info. Returns the org name. */
export async function testZohoConnection(): Promise<string> {
  const cfg = getZohoConfig();
  if (!cfg.client_id || !cfg.client_secret || !cfg.refresh_token)
    throw new Error("Fill in client ID, client secret, and refresh token first");
  tokenCache.token = "";
  const response = await zohoCall(cfg, "GET", "/crm/v2/org");
  const org = (response.org as { company_name?: string }[] | undefined)?.[0];
  return org?.company_name || "connected";
}
