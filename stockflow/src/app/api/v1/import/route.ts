import { getDb, tx } from "@/lib/db";
import { emitEvent } from "@/lib/events";
import { json, route } from "@/lib/api";
import { moveStock } from "@/lib/stock";
import { parseNumber } from "@/lib/csv";
import { ApiError, id as makeId, now } from "@/lib/util";

type ImportRow = Record<string, string | undefined>;
type RowError = { row: number; message: string };

const MAX_ROWS = 5000;

/**
 * Bulk import (used by the Import wizard, callable directly too).
 * Body: { type: "items"|"customers"|"vendors", rows: [...], location_id? }
 * Rows are already column-mapped objects of strings (see /import UI).
 * Existing records (matched by SKU for items, name for customers/vendors)
 * are skipped, so re-running an import is safe.
 *
 * Emits a single import.completed event instead of one event per row,
 * so a large import doesn't flood webhook receivers.
 */
export const POST = route({ write: true }, async (req) => {
  const body = (await req.json()) as {
    type?: string;
    rows?: unknown;
    location_id?: string;
  };
  const type = body.type;
  if (type !== "items" && type !== "customers" && type !== "vendors")
    throw new ApiError(400, "Field 'type' must be one of: items, customers, vendors");
  if (!Array.isArray(body.rows) || body.rows.length === 0)
    throw new ApiError(400, "Field 'rows' must be a non-empty array");
  if (body.rows.length > MAX_ROWS)
    throw new ApiError(400, `Too many rows (max ${MAX_ROWS} per request)`);

  const db = getDb();
  if (body.location_id && !db.prepare("SELECT id FROM locations WHERE id = ?").get(body.location_id))
    throw new ApiError(404, `Location not found: ${body.location_id}`);

  const rows = body.rows as ImportRow[];
  let created = 0;
  let stocked = 0;
  const skipped: RowError[] = [];
  const errors: RowError[] = [];

  for (const [index, raw] of rows.entries()) {
    const rowNum = index + 1;
    try {
      if (type === "items") {
        const sku = (raw.sku || "").trim();
        const name = (raw.name || "").trim();
        if (!sku || !name) {
          errors.push({ row: rowNum, message: "sku and name are required" });
          continue;
        }
        if (db.prepare("SELECT id FROM items WHERE sku = ?").get(sku)) {
          skipped.push({ row: rowNum, message: `SKU '${sku}' already exists` });
          continue;
        }
        const itemId = makeId("itm");
        const qtyOnHand = parseNumber(raw.qty_on_hand);
        tx((dbTx) => {
          const ts = now();
          dbTx
            .prepare(
              `INSERT INTO items (id, sku, name, description, type, barcode, category, uom, cost, price, reorder_point, active, created_at, updated_at)
               VALUES (?, ?, ?, ?, 'inventory', ?, ?, ?, ?, ?, ?, 1, ?, ?)`
            )
            .run(
              itemId,
              sku,
              name,
              (raw.description || "").trim(),
              (raw.barcode || "").trim(),
              (raw.category || "").trim(),
              (raw.uom || "ea").trim() || "ea",
              parseNumber(raw.cost) ?? 0,
              parseNumber(raw.price) ?? 0,
              parseNumber(raw.reorder_point) ?? 0,
              ts,
              ts
            );
          if (qtyOnHand && qtyOnHand > 0) {
            if (!body.location_id)
              throw new ApiError(400, "location_id is required to import quantities on hand");
            moveStock(dbTx, {
              itemId,
              locationId: body.location_id,
              delta: qtyOnHand,
              reason: "import",
              refType: "import",
              note: "Initial quantity from import",
            });
            stocked++;
          }
        });
        created++;
      } else {
        const table = type; // customers | vendors
        const name = (raw.name || "").trim();
        if (!name) {
          errors.push({ row: rowNum, message: "name is required" });
          continue;
        }
        const exists = db.prepare(`SELECT id FROM ${table} WHERE name = ?`).get(name);
        if (exists) {
          skipped.push({ row: rowNum, message: `'${name}' already exists` });
          continue;
        }
        const ts = now();
        db.prepare(
          `INSERT INTO ${table} (id, name, company, email, phone, address, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          makeId(type === "customers" ? "cus" : "ven"),
          name,
          (raw.company || "").trim(),
          (raw.email || "").trim(),
          (raw.phone || "").trim(),
          (raw.address || "").trim(),
          (raw.notes || "").trim(),
          ts,
          ts
        );
        created++;
      }
    } catch (err) {
      errors.push({
        row: rowNum,
        message: err instanceof ApiError ? err.message : "Unexpected error importing this row",
      });
    }
  }

  const summary = {
    type,
    total_rows: rows.length,
    created,
    with_initial_stock: stocked,
    skipped: skipped.length,
    errors: errors.length,
  };
  emitEvent("import.completed", "import", type, summary);
  return json({ data: { ...summary, skipped_details: skipped.slice(0, 50), error_details: errors.slice(0, 50) } }, 201);
});
