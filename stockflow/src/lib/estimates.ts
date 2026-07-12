import { getDb } from "./db";
import { ApiError } from "./util";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function estimateWithLines(estimateId: string): any {
  const db = getDb();
  const estimate = db
    .prepare(
      `SELECT e.*, c.name AS customer_name, c.email AS customer_email, l.name AS location_name
       FROM estimates e
       JOIN customers c ON c.id = e.customer_id
       JOIN locations l ON l.id = e.location_id
       WHERE e.id = ?`
    )
    .get(estimateId) as Record<string, unknown> | undefined;
  if (!estimate) throw new ApiError(404, `Estimate not found: ${estimateId}`);
  const lines = db
    .prepare(
      `SELECT el.*, i.sku, i.name AS item_name, i.uom
       FROM estimate_lines el JOIN items i ON i.id = el.item_id
       WHERE el.estimate_id = ? ORDER BY el.rowid`
    )
    .all(estimateId) as Record<string, unknown>[];
  const total = lines.reduce((sum, l) => sum + (l.qty as number) * (l.unit_price as number), 0);
  return { ...estimate, lines, total };
}
