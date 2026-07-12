import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";
import { id as makeId, now, validate } from "@/lib/util";
import { validateEventList, validateUrl } from "@/lib/webhook-validation";

export const GET = route({ write: false }, () => {
  const rows = getDb()
    .prepare(
      `SELECT w.id, w.url, w.description, w.events, w.active, w.created_at, w.updated_at,
              (SELECT COUNT(*) FROM webhook_deliveries d WHERE d.webhook_id = w.id) AS delivery_count,
              (SELECT COUNT(*) FROM webhook_deliveries d WHERE d.webhook_id = w.id AND d.status = 'failed') AS failed_count
       FROM webhooks w ORDER BY w.created_at DESC`
    )
    .all() as Record<string, unknown>[];
  return json({ data: rows.map((r) => ({ ...r, events: JSON.parse(r.events as string) })) });
});

export const POST = route({ write: true }, async (req) => {
  const raw = (await req.json()) as Record<string, unknown>;
  const body = validate(raw, {
    url: { type: "string", required: true },
    description: { type: "string" },
    active: { type: "boolean" },
  });
  validateUrl(body.url as string);
  const events = validateEventList(raw.events);
  const db = getDb();
  const hookId = makeId("wh");
  const secret = `whsec_${crypto.randomBytes(24).toString("hex")}`;
  const ts = now();
  db.prepare(
    "INSERT INTO webhooks (id, url, description, secret, events, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    hookId,
    body.url as string,
    (body.description as string) || "",
    secret,
    JSON.stringify(events),
    body.active === false ? 0 : 1,
    ts,
    ts
  );
  // The signing secret is returned once, on creation.
  return json(
    { data: { id: hookId, url: body.url, description: body.description || "", events, active: body.active !== false, secret, created_at: ts } },
    201
  );
});
