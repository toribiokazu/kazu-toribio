import { json, route } from "@/lib/api";
import { ApiError } from "@/lib/util";
import { testQboConnection } from "@/lib/qbo";

export const POST = route({ write: true }, async () => {
  try {
    const company = await testQboConnection();
    return json({ data: { ok: true, company } });
  } catch (err) {
    throw new ApiError(502, err instanceof Error ? err.message : "Connection test failed");
  }
});
