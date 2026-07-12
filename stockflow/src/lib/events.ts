import crypto from "node:crypto";
import { getDb } from "./db";
import { id, now } from "./util";

export const EVENT_TYPES = [
  "item.created",
  "item.updated",
  "item.deleted",
  "location.created",
  "location.updated",
  "customer.created",
  "customer.updated",
  "customer.deleted",
  "vendor.created",
  "vendor.updated",
  "vendor.deleted",
  "stock.adjusted",
  "stock.transferred",
  "stock.low",
  "sales_order.created",
  "sales_order.updated",
  "sales_order.fulfilled",
  "sales_order.canceled",
  "purchase_order.created",
  "purchase_order.updated",
  "purchase_order.received",
  "purchase_order.canceled",
  "bom.created",
  "bom.updated",
  "work_order.created",
  "work_order.updated",
  "work_order.completed",
  "import.completed",
] as const;

export type EventType = (typeof EVENT_TYPES)[number] | "webhook.test";

const RETRY_DELAYS_MS = [5_000, 30_000, 120_000]; // after the initial attempt
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

/** "*" matches everything; "item.*" matches any item event; exact types match themselves. */
export function eventMatches(subscribed: string[], type: string): boolean {
  return subscribed.some(
    (pattern) =>
      pattern === "*" ||
      pattern === type ||
      (pattern.endsWith(".*") && type.startsWith(pattern.slice(0, -1)))
  );
}

export function signPayload(secret: string, timestamp: string, body: string): string {
  const mac = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

/**
 * Record an event and fan it out to matching webhook subscriptions.
 * Delivery happens asynchronously; API responses never wait on receivers.
 */
export function emitEvent(
  type: EventType,
  entityType: string,
  entityId: string,
  payload: unknown
): string {
  const db = getDb();
  const eventId = id("evt");
  const createdAt = now();
  const envelope = {
    id: eventId,
    type,
    created_at: createdAt,
    data: payload,
  };
  const body = JSON.stringify(envelope);
  db.prepare(
    "INSERT INTO events (id, type, entity_type, entity_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(eventId, type, entityType, entityId, body, createdAt);

  const hooks = db.prepare("SELECT id, events FROM webhooks WHERE active = 1").all() as {
    id: string;
    events: string;
  }[];
  for (const hook of hooks) {
    let subscribed: string[] = [];
    try {
      subscribed = JSON.parse(hook.events);
    } catch {
      subscribed = [];
    }
    if (!eventMatches(subscribed, type)) continue;
    const deliveryId = id("del");
    db.prepare(
      "INSERT INTO webhook_deliveries (id, webhook_id, event_id, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(deliveryId, hook.id, eventId, type, body, createdAt);
    void attemptDelivery(deliveryId);
  }
  return eventId;
}

/** POST one delivery to its webhook URL, with HMAC signature and retries. */
export async function attemptDelivery(deliveryId: string): Promise<void> {
  const db = getDb();
  const delivery = db
    .prepare(
      `SELECT d.id, d.payload, d.event_type, d.attempts, w.url, w.secret, w.active
       FROM webhook_deliveries d JOIN webhooks w ON w.id = d.webhook_id
       WHERE d.id = ?`
    )
    .get(deliveryId) as
    | {
        id: string;
        payload: string;
        event_type: string;
        attempts: number;
        url: string;
        secret: string;
        active: number;
      }
    | undefined;
  if (!delivery || !delivery.active) return;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = signPayload(delivery.secret, timestamp, delivery.payload);
  const attempts = delivery.attempts + 1;

  let status: "success" | "failed" | "pending" = "failed";
  let responseStatus: number | null = null;
  let responseBody = "";
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(delivery.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "StockFlow-Webhook/1.0",
        "x-stockflow-event": delivery.event_type,
        "x-stockflow-delivery": delivery.id,
        "x-stockflow-signature": signature,
      },
      body: delivery.payload,
      signal: controller.signal,
    });
    clearTimeout(timer);
    responseStatus = res.status;
    responseBody = (await res.text()).slice(0, 2000);
    status = res.ok ? "success" : "failed";
  } catch (err) {
    responseBody = err instanceof Error ? err.message : String(err);
  }

  if (status !== "success" && attempts < MAX_ATTEMPTS) {
    status = "pending";
    const timer = setTimeout(() => void attemptDelivery(deliveryId), RETRY_DELAYS_MS[attempts - 1]);
    timer.unref?.();
  }

  db.prepare(
    "UPDATE webhook_deliveries SET status = ?, attempts = ?, response_status = ?, response_body = ?, last_attempt_at = ? WHERE id = ?"
  ).run(status, attempts, responseStatus, responseBody, now(), deliveryId);
}

/** Reset a delivery and try again immediately (manual redeliver). */
export function redeliver(deliveryId: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE webhook_deliveries SET status = 'pending', attempts = 0 WHERE id = ?"
  ).run(deliveryId);
  void attemptDelivery(deliveryId);
}
