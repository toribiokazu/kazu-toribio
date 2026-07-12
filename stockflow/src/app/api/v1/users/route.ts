import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";
import { ApiError, validate } from "@/lib/util";
import { createUser, type Role } from "@/lib/users";

// Reaching these endpoints requires the 'users' area, i.e. super admin
// (or a full-scope API key for automation).

export const GET = route({ write: true }, () => {
  const rows = getDb()
    .prepare("SELECT id, name, email, role, active, last_login_at, created_at FROM users ORDER BY created_at")
    .all();
  return json({ data: rows });
});

export const POST = route({ write: true }, async (req) => {
  const body = validate(await req.json(), {
    name: { type: "string", required: true },
    email: { type: "string", required: true },
    password: { type: "string", required: true },
    role: { type: "string", enum: ["super_admin", "admin", "user"] },
  });
  if ((body.password as string).length < 8) throw new ApiError(400, "Password must be at least 8 characters");
  if (!/.+@.+\..+/.test(body.email as string)) throw new ApiError(400, "Invalid email address");
  const user = createUser(
    body.name as string,
    body.email as string,
    body.password as string,
    (body.role as Role) || "user"
  );
  return json({ data: user }, 201);
});
