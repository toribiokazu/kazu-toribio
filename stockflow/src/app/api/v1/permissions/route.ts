import { json, route } from "@/lib/api";
import { ApiError } from "@/lib/util";
import { adminAreas, AREAS, saveAdminAreas, USER_AREAS } from "@/lib/users";

/** The permission matrix: which areas each role can reach. */
export const GET = route({ write: true }, () =>
  json({
    data: {
      all_areas: AREAS,
      super_admin: AREAS,
      admin: adminAreas(),
      user: USER_AREAS,
      configurable: AREAS.filter((a) => a !== "users" && a !== "export"),
    },
  })
);

/** Super admin picks what the admin role can access. Body: { admin: ["items", ...] } */
export const PUT = route({ write: true }, async (req) => {
  const body = (await req.json()) as { admin?: unknown };
  if (!Array.isArray(body.admin) || !body.admin.every((a) => typeof a === "string"))
    throw new ApiError(400, "Field 'admin' must be an array of area names");
  return json({ data: { admin: saveAdminAreas(body.admin) } });
});
