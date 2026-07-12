import { getDb, tx } from "@/lib/db";
import { emitEvent } from "@/lib/events";
import { json, route } from "@/lib/api";
import { ApiError, id as makeId, now, pagination, validate } from "@/lib/util";
import { bomWithLines } from "@/lib/manufacturing";

export const GET = route({ write: false }, (req) => {
  const db = getDb();
  const url = new URL(req.url);
  const { limit, offset } = pagination(url);
  const q = url.searchParams.get("q");
  const whereSql = q ? "WHERE b.name LIKE ? OR i.sku LIKE ? OR i.name LIKE ?" : "";
  const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];
  const rows = db
    .prepare(
      `SELECT b.*, i.sku AS output_sku, i.name AS output_item_name,
              (SELECT COUNT(*) FROM bom_lines WHERE bom_id = b.id) AS component_count
       FROM boms b JOIN items i ON i.id = b.output_item_id
       ${whereSql} ORDER BY b.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM boms b JOIN items i ON i.id = b.output_item_id ${whereSql}`)
      .get(...params) as { n: number }
  ).n;
  return json({ data: rows, total, limit, offset });
});

export const POST = route({ write: true }, async (req) => {
  const raw = (await req.json()) as Record<string, unknown>;
  const body = validate(raw, {
    name: { type: "string", required: true },
    output_item_id: { type: "string", required: true },
    output_qty: { type: "number", min: 0 },
    notes: { type: "string" },
  });
  if (!Array.isArray(raw.lines) || raw.lines.length === 0)
    throw new ApiError(400, "Field 'lines' must be a non-empty array of components");
  const db = getDb();
  const output = db.prepare("SELECT id, type FROM items WHERE id = ?").get(body.output_item_id as string) as
    | { id: string; type: string }
    | undefined;
  if (!output) throw new ApiError(404, `Item not found: ${body.output_item_id}`);
  if (output.type !== "inventory") throw new ApiError(422, "Output item must be an inventory-type item");

  const bomId = makeId("bom");
  tx((dbTx) => {
    const ts = now();
    dbTx
      .prepare(
        "INSERT INTO boms (id, name, output_item_id, output_qty, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        bomId,
        body.name as string,
        body.output_item_id as string,
        (body.output_qty as number) || 1,
        (body.notes as string) || "",
        ts,
        ts
      );
    const insert = dbTx.prepare(
      "INSERT INTO bom_lines (id, bom_id, component_item_id, qty) VALUES (?, ?, ?, ?)"
    );
    for (const [i, rawLine] of (raw.lines as unknown[]).entries()) {
      const line = rawLine as Record<string, unknown>;
      if (typeof line.component_item_id !== "string")
        throw new ApiError(400, `lines[${i}].component_item_id is required`);
      if (line.component_item_id === body.output_item_id)
        throw new ApiError(422, "A BOM cannot consume its own output item");
      if (typeof line.qty !== "number" || line.qty <= 0)
        throw new ApiError(400, `lines[${i}].qty must be a positive number`);
      if (!dbTx.prepare("SELECT id FROM items WHERE id = ?").get(line.component_item_id))
        throw new ApiError(404, `Item not found: ${line.component_item_id}`);
      insert.run(makeId("boml"), bomId, line.component_item_id, line.qty);
    }
  });
  const bom = bomWithLines(bomId);
  emitEvent("bom.created", "bom", bomId, bom);
  return json({ data: bom }, 201);
});
