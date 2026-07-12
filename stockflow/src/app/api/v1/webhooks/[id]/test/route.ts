import { getDb } from "@/lib/db";
import { attemptDelivery } from "@/lib/events";
import { json, route } from "@/lib/api";
import { ApiError, id as makeId, now } from "@/lib/util";

/** Send a webhook.test event to this endpoint immediately and report the result. */
export const POST = route({ write: true }, async (_req, { params }) => {
  const { id } = await params;
  const db = getDb();
  const hook = db.prepare("SELECT id, active FROM webhooks WHERE id = ?").get(id) as
    | { id: string; active: number }
    | undefined;
  if (!hook) throw new ApiError(404, `Webhook not found: ${id}`);
  if (!hook.active) throw new ApiError(422, "Webhook is disabled; enable it before testing");

  const eventId = makeId("evt");
  const createdAt = now();
  const envelope = JSON.stringify({
    id: eventId,
    type: "webhook.test",
    created_at: createdAt,
    data: { message: "Hello from StockFlow! Your webhook endpoint is reachable." },
  });
  db.prepare(
    "INSERT INTO events (id, type, entity_type, entity_id, payload, created_at) VALUES (?, 'webhook.test', 'webhook', ?, ?, ?)"
  ).run(eventId, id, envelope, createdAt);
  const deliveryId = makeId("del");
  db.prepare(
    "INSERT INTO webhook_deliveries (id, webhook_id, event_id, event_type, payload, created_at) VALUES (?, ?, ?, 'webhook.test', ?, ?)"
  ).run(deliveryId, id, eventId, envelope, createdAt);

  await attemptDelivery(deliveryId);
  const delivery = db.prepare("SELECT * FROM webhook_deliveries WHERE id = ?").get(deliveryId);
  return json({ data: delivery });
});
