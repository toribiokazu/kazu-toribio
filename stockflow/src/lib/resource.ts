import { getDb } from "./db";
import { emitEvent, type EventType } from "./events";
import { json, route } from "./api";
import { ApiError, id as makeId, now, pagination, validate } from "./util";

type FieldSpec = Parameters<typeof validate>[1];

export type ResourceConfig = {
  table: string;
  idPrefix: string;
  entity: string; // event/entity name, e.g. "item"
  createFields: FieldSpec;
  updateFields: FieldSpec;
  searchColumns: string[];
  defaults?: Record<string, string | number>;
  /** Extra list filters: query-param name -> SQL column (exact match). */
  filters?: Record<string, string>;
};

export function getOr404(table: string, entity: string, rowId: string) {
  const row = getDb().prepare(`SELECT * FROM ${table} WHERE id = ?`).get(rowId);
  if (!row) throw new ApiError(404, `${entity} not found: ${rowId}`);
  return row as Record<string, unknown>;
}

/** Standard list/create/get/patch/delete handlers for a flat table. */
export function crudRoutes(cfg: ResourceConfig) {
  const list = route({ write: false }, (req) => {
    const db = getDb();
    const url = new URL(req.url);
    const { limit, offset } = pagination(url);
    const where: string[] = [];
    const params: (string | number)[] = [];
    const q = url.searchParams.get("q");
    if (q && cfg.searchColumns.length) {
      where.push(`(${cfg.searchColumns.map((c) => `${c} LIKE ?`).join(" OR ")})`);
      cfg.searchColumns.forEach(() => params.push(`%${q}%`));
    }
    for (const [param, column] of Object.entries(cfg.filters || {})) {
      const value = url.searchParams.get(param);
      if (value !== null) {
        where.push(`${column} = ?`);
        params.push(value);
      }
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = (
      db.prepare(`SELECT COUNT(*) AS n FROM ${cfg.table} ${whereSql}`).get(...params) as { n: number }
    ).n;
    const data = db
      .prepare(`SELECT * FROM ${cfg.table} ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset);
    return json({ data, total, limit, offset });
  });

  const create = route({ write: true }, async (req) => {
    const body = validate(await req.json(), cfg.createFields);
    const db = getDb();
    const rowId = makeId(cfg.idPrefix);
    const ts = now();
    const record: Record<string, string | number | boolean> = {
      ...cfg.defaults,
      ...body,
      id: rowId,
      created_at: ts,
      updated_at: ts,
    };
    const cols = Object.keys(record);
    db.prepare(
      `INSERT INTO ${cfg.table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`
    ).run(...cols.map((c) => normalize(record[c])));
    const row = getOr404(cfg.table, cfg.entity, rowId);
    emitEvent(`${cfg.entity}.created` as EventType, cfg.entity, rowId, row);
    return json({ data: row }, 201);
  });

  const get = route({ write: false }, async (_req, { params }) => {
    const { id } = await params;
    return json({ data: getOr404(cfg.table, cfg.entity, id) });
  });

  const patch = route({ write: true }, async (req, { params }) => {
    const { id } = await params;
    getOr404(cfg.table, cfg.entity, id);
    const body = validate(await req.json(), cfg.updateFields);
    const keys = Object.keys(body);
    if (keys.length) {
      const db = getDb();
      db.prepare(
        `UPDATE ${cfg.table} SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`
      ).run(...keys.map((k) => normalize(body[k])), now(), id);
    }
    const row = getOr404(cfg.table, cfg.entity, id);
    emitEvent(`${cfg.entity}.updated` as EventType, cfg.entity, id, row);
    return json({ data: row });
  });

  const remove = route({ write: true }, async (_req, { params }) => {
    const { id } = await params;
    const row = getOr404(cfg.table, cfg.entity, id);
    getDb().prepare(`DELETE FROM ${cfg.table} WHERE id = ?`).run(id);
    emitEvent(`${cfg.entity}.deleted` as EventType, cfg.entity, id, row);
    return json({ data: { id, deleted: true } });
  });

  return { list, create, get, patch, remove };
}

function normalize(v: string | number | boolean): string | number {
  return typeof v === "boolean" ? (v ? 1 : 0) : v;
}
