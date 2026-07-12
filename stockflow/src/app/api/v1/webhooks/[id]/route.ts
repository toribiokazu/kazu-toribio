import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";
import { ApiError, now, validate } from "@/lib/util";
import { validateEventList, validateUrl } from "@/lib/webhook-validation";

function getHook(id: string) {
  const row = getDb()
    .prepare(
      "SELECT id, url, description, events, active, created_at, updated_at FROM webhooks WHERE id = ?"
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!row) throw new ApiError(404, `Webhook not found: ${id}`);
  return { ...row, events: JSON.parse(row.events as string) };
}

export const GET = route({ write: false }, async (_req, { params }) => {
  const { id } = await params;
  return json({ data: getHook(id) });
});

export const PATCH = route({ write: true }, async (req, { params }) => {
  const { id } = await params;
  getHook(id);
  const raw = (await req.json()) as Record<string, unknown>;
  const body = validate(raw, {
    url: { type: "string" },
    description: { type: "string" },
    active: { type: "boolean" },
  });
  const db = getDb();
  const sets: string[] = [];
  const values: (string | number)[] = [];
  if (body.url !== undefined) {
    validateUrl(body.url as string);
    sets.push("url = ?");
    values.push(body.url as string);
  }
  if (body.description !== undefined) {
    sets.push("description = ?");
    values.push(body.description as string);
  }
  if (body.active !== undefined) {
    sets.push("active = ?");
    values.push(body.active ? 1 : 0);
  }
  if (raw.events !== undefined) {
    sets.push("events = ?");
    values.push(JSON.stringify(validateEventList(raw.events)));
  }
  if (sets.length) {
    db.prepare(`UPDATE webhooks SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`).run(...values, now(), id);
  }
  return json({ data: getHook(id) });
});

export const DELETE = route({ write: true }, async (_req, { params }) => {
  const { id } = await params;
  getHook(id);
  getDb().prepare("DELETE FROM webhooks WHERE id = ?").run(id);
  return json({ data: { id, deleted: true } });
});
