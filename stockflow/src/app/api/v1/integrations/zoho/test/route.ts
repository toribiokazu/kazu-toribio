import { json, route } from "@/lib/api";
import { ApiError } from "@/lib/util";
import { testZohoConnection } from "@/lib/zoho";

export const POST = route({ write: true }, async () => {
  try {
    const org = await testZohoConnection();
    return json({ data: { ok: true, org } });
  } catch (err) {
    throw new ApiError(502, err instanceof Error ? err.message : "Connection test failed");
  }
});
