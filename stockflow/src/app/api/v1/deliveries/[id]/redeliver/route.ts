import { getDb } from "@/lib/db";
import { redeliver } from "@/lib/events";
import { json, route } from "@/lib/api";
import { ApiError } from "@/lib/util";

/** Manually retry a webhook delivery (any status). */
export const POST = route({ write: true }, async (_req, { params }) => {
  const { id } = await params;
  const db = getDb();
  if (!db.prepare("SELECT id FROM webhook_deliveries WHERE id = ?").get(id))
    throw new ApiError(404, `Delivery not found: ${id}`);
  redeliver(id);
  return json({ data: { id, queued: true } });
});
