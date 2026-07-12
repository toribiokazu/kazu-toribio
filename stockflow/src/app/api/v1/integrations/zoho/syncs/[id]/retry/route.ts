import { json, route } from "@/lib/api";
import { ApiError } from "@/lib/util";
import { retrySync } from "@/lib/zoho";

/** Re-run a sync from the log (useful after fixing credentials or stage names). */
export const POST = route({ write: true }, async (_req, { params }) => {
  const { id } = await params;
  try {
    await retrySync(id);
  } catch (err) {
    throw new ApiError(404, err instanceof Error ? err.message : "Retry failed");
  }
  return json({ data: { id, retried: true } });
});
