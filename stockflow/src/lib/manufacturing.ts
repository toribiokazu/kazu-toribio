import { getDb } from "./db";
import { ApiError } from "./util";

export function bomWithLines(bomId: string) {
  const db = getDb();
  const bom = db
    .prepare(
      `SELECT b.*, i.sku AS output_sku, i.name AS output_item_name
       FROM boms b JOIN items i ON i.id = b.output_item_id WHERE b.id = ?`
    )
    .get(bomId) as Record<string, unknown> | undefined;
  if (!bom) throw new ApiError(404, `BOM not found: ${bomId}`);
  const lines = db
    .prepare(
      `SELECT bl.*, i.sku, i.name AS item_name, i.uom
       FROM bom_lines bl JOIN items i ON i.id = bl.component_item_id
       WHERE bl.bom_id = ? ORDER BY bl.rowid`
    )
    .all(bomId);
  return { ...bom, lines };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function workOrderDetail(woId: string): any {
  const db = getDb();
  const wo = db
    .prepare(
      `SELECT w.*, b.name AS bom_name, b.output_item_id, b.output_qty,
              i.sku AS output_sku, i.name AS output_item_name, l.name AS location_name
       FROM work_orders w
       JOIN boms b ON b.id = w.bom_id
       JOIN items i ON i.id = b.output_item_id
       JOIN locations l ON l.id = w.location_id
       WHERE w.id = ?`
    )
    .get(woId) as Record<string, unknown> | undefined;
  if (!wo) throw new ApiError(404, `Work order not found: ${woId}`);
  const components = db
    .prepare(
      `SELECT bl.component_item_id, bl.qty AS qty_per_build, i.sku, i.name AS item_name,
              COALESCE((SELECT qty FROM stock s WHERE s.item_id = bl.component_item_id AND s.location_id = ?), 0) AS available
       FROM bom_lines bl JOIN items i ON i.id = bl.component_item_id
       WHERE bl.bom_id = ?`
    )
    .all(wo.location_id as string, wo.bom_id as string);
  return { ...wo, components };
}
