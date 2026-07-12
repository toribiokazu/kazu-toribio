import { getDb } from "@/lib/db";
import { EVENT_TYPES } from "@/lib/events";
import { json, route } from "@/lib/api";
import { pagination } from "@/lib/util";

/** Audit feed of everything that happened, newest first. Also handy for polling integrations. */
export const GET = route({ write: false }, (req) => {
  const db = getDb();
  const url = new URL(req.url);
  const { limit, offset } = pagination(url);
  const where: string[] = [];
  const params: string[] = [];
  const type = url.searchParams.get("type");
  if (type) {
    where.push("type = ?");
    params.push(type);
  }
  const since = url.searchParams.get("since");
  if (since) {
    where.push("created_at > ?");
    params.push(since);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = (
    db
      .prepare(`SELECT * FROM events ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as Record<string, unknown>[]
  ).map((r) => ({ ...r, payload: JSON.parse(r.payload as string) }));
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM events ${whereSql}`).get(...params) as { n: number }
  ).n;
  return json({ data: rows, total, limit, offset, event_types: EVENT_TYPES });
});
