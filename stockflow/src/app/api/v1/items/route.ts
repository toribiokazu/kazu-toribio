import { getDb } from "@/lib/db";
import { emitEvent } from "@/lib/events";
import { json, route } from "@/lib/api";
import { id as makeId, now, pagination, validate } from "@/lib/util";
import { getOr404 } from "@/lib/resource";

const ITEM_CREATE_FIELDS = {
  sku: { type: "string", required: true },
  name: { type: "string", required: true },
  description: { type: "string" },
  type: { type: "string", enum: ["inventory", "non_inventory", "service"] },
  barcode: { type: "string" },
  category: { type: "string" },
  uom: { type: "string" },
  cost: { type: "number", min: 0 },
  price: { type: "number", min: 0 },
  reorder_point: { type: "number", min: 0 },
  active: { type: "boolean" },
} as const;

export const GET = route({ write: false }, (req) => {
  const db = getDb();
  const url = new URL(req.url);
  const { limit, offset } = pagination(url);
  const where: string[] = [];
  const params: (string | number)[] = [];
  const q = url.searchParams.get("q");
  if (q) {
    where.push("(i.sku LIKE ? OR i.name LIKE ? OR i.barcode LIKE ? OR i.category LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  const type = url.searchParams.get("type");
  if (type) {
    where.push("i.type = ?");
    params.push(type);
  }
  const active = url.searchParams.get("active");
  if (active !== null) {
    where.push("i.active = ?");
    params.push(active === "true" || active === "1" ? 1 : 0);
  }
  if (url.searchParams.get("low_stock") === "true") {
    where.push("i.reorder_point > 0 AND i.type = 'inventory'");
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const having = url.searchParams.get("low_stock") === "true" ? "HAVING on_hand <= i.reorder_point" : "";
  const rows = db
    .prepare(
      `SELECT i.*, COALESCE(SUM(s.qty), 0) AS on_hand
       FROM items i LEFT JOIN stock s ON s.item_id = i.id
       ${whereSql} GROUP BY i.id ${having}
       ORDER BY i.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM (SELECT i.id, COALESCE(SUM(s.qty),0) AS on_hand FROM items i LEFT JOIN stock s ON s.item_id = i.id ${whereSql} GROUP BY i.id ${having})`
      )
      .get(...params) as { n: number }
  ).n;
  return json({ data: rows, total, limit, offset });
});

export const POST = route({ write: true }, async (req) => {
  const body = validate(await req.json(), { ...ITEM_CREATE_FIELDS });
  const db = getDb();
  const itemId = makeId("itm");
  const ts = now();
  const record = {
    id: itemId,
    description: "",
    type: "inventory",
    barcode: "",
    category: "",
    uom: "ea",
    cost: 0,
    price: 0,
    reorder_point: 0,
    active: 1,
    ...body,
    created_at: ts,
    updated_at: ts,
  } as Record<string, string | number | boolean>;
  if (typeof record.active === "boolean") record.active = record.active ? 1 : 0;
  const cols = Object.keys(record);
  db.prepare(`INSERT INTO items (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).run(
    ...cols.map((c) => record[c] as string | number)
  );
  const row = getOr404("items", "item", itemId);
  emitEvent("item.created", "item", itemId, row);
  return json({ data: row }, 201);
});
