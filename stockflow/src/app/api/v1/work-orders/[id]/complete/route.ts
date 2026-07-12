import { tx } from "@/lib/db";
import { emitEvent } from "@/lib/events";
import { json, route } from "@/lib/api";
import { ApiError, now } from "@/lib/util";
import { checkLowStock, moveStock } from "@/lib/stock";
import { workOrderDetail } from "@/lib/manufacturing";

/**
 * Complete a build: consumes BOM components from the work order's location
 * and produces the output item there. Fails atomically if any component
 * is short.
 */
export const POST = route({ write: true }, async (_req, { params }) => {
  const { id } = await params;
  const wo = workOrderDetail(id) as {
    id: string;
    status: string;
    qty: number;
    location_id: string;
    output_item_id: string;
    output_qty: number;
    components: { component_item_id: string; qty_per_build: number }[];
  };
  if (wo.status === "completed") throw new ApiError(422, "Work order is already completed");
  if (wo.status === "canceled") throw new ApiError(422, "Work order is canceled");

  tx((db) => {
    for (const component of wo.components) {
      moveStock(db, {
        itemId: component.component_item_id,
        locationId: wo.location_id,
        delta: -(component.qty_per_build * wo.qty),
        reason: "build_consume",
        refType: "work_order",
        refId: wo.id,
      });
    }
    moveStock(db, {
      itemId: wo.output_item_id,
      locationId: wo.location_id,
      delta: wo.output_qty * wo.qty,
      reason: "build_produce",
      refType: "work_order",
      refId: wo.id,
    });
    db.prepare("UPDATE work_orders SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?").run(
      now(),
      now(),
      id
    );
    for (const component of wo.components) checkLowStock(db, component.component_item_id);
  });

  const updated = workOrderDetail(id);
  emitEvent("work_order.completed", "work_order", id, updated);
  return json({ data: updated });
});
