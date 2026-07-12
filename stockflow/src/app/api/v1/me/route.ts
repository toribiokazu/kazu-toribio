import { json, route } from "@/lib/api";
import { areasForRole, AREAS } from "@/lib/users";

/** Who am I + which areas can I see. Drives the nav and client-side guards. */
export const GET = route({ write: false }, (_req, { auth }) => {
  if (auth.via === "user") {
    return json({
      data: {
        user: { id: auth.user.id, name: auth.user.name, email: auth.user.email, role: auth.user.role },
        areas: areasForRole(auth.user.role),
      },
    });
  }
  if (auth.via === "api_key") {
    return json({
      data: { user: { id: auth.keyId, name: "API key", email: "", role: "api_key" }, areas: [...AREAS] },
    });
  }
  return json({ data: { user: null, areas: [...AREAS], setup_required: true } });
});
