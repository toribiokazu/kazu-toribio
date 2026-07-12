import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";
import { ApiError, now, validate } from "@/lib/util";
import { hashPassword } from "@/lib/users";

function activeSuperAdmins(): number {
  return (
    getDb()
      .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin' AND active = 1")
      .get() as { n: number }
  ).n;
}

export const PATCH = route({ write: true }, async (req, { params }) => {
  const { id } = await params;
  const db = getDb();
  const user = db.prepare("SELECT id, role, active FROM users WHERE id = ?").get(id) as
    | { id: string; role: string; active: number }
    | undefined;
  if (!user) throw new ApiError(404, `User not found: ${id}`);
  const body = validate(await req.json(), {
    name: { type: "string" },
    role: { type: "string", enum: ["super_admin", "admin", "user"] },
    active: { type: "boolean" },
    password: { type: "string" },
  });

  // Never leave the system without an active super admin.
  const losingSuperAdmin =
    user.role === "super_admin" &&
    user.active === 1 &&
    ((body.role !== undefined && body.role !== "super_admin") || body.active === false);
  if (losingSuperAdmin && activeSuperAdmins() <= 1)
    throw new ApiError(422, "This is the only active super admin — promote someone else first");

  const sets: string[] = [];
  const values: (string | number)[] = [];
  if (body.name !== undefined) {
    sets.push("name = ?");
    values.push(body.name as string);
  }
  if (body.role !== undefined) {
    sets.push("role = ?");
    values.push(body.role as string);
  }
  if (body.active !== undefined) {
    sets.push("active = ?");
    values.push(body.active ? 1 : 0);
    if (body.active === false) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  }
  if (body.password !== undefined) {
    if ((body.password as string).length < 8) throw new ApiError(400, "Password must be at least 8 characters");
    sets.push("password_hash = ?");
    values.push(hashPassword(body.password as string));
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  }
  if (sets.length) {
    db.prepare(`UPDATE users SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`).run(...values, now(), id);
  }
  const updated = db
    .prepare("SELECT id, name, email, role, active, last_login_at, created_at FROM users WHERE id = ?")
    .get(id);
  return json({ data: updated });
});
