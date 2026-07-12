import { getDb } from "@/lib/db";
import { createApiKey } from "@/lib/auth";
import { json, route } from "@/lib/api";
import { validate } from "@/lib/util";

// Key management always requires full access (or the UI).
export const GET = route({ write: true }, () => {
  const rows = getDb()
    .prepare(
      "SELECT id, name, prefix, scope, last_used_at, created_at, revoked_at FROM api_keys ORDER BY created_at DESC"
    )
    .all();
  return json({ data: rows });
});

export const POST = route({ write: true }, async (req) => {
  const body = validate(await req.json(), {
    name: { type: "string", required: true },
    scope: { type: "string", enum: ["full", "read"] },
  });
  const key = createApiKey(body.name as string, (body.scope as "full" | "read") || "full");
  // `token` is returned exactly once; only its hash is stored.
  return json({ data: key }, 201);
});
