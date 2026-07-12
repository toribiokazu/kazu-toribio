import { NextResponse } from "next/server";
import { createSession, createUser, userCount } from "@/lib/users";

/** Whether the first-run setup screen should be shown. */
export async function GET() {
  return NextResponse.json({ data: { setup_required: userCount() === 0 } });
}

/** One-time creation of the super admin account on a fresh install. */
export async function POST(req: Request) {
  if (userCount() > 0) {
    return NextResponse.json(
      { error: { message: "Setup is already complete — sign in instead" } },
      { status: 409 }
    );
  }
  const body = (await req.json().catch(() => ({}))) as { name?: string; email?: string; password?: string };
  if (
    typeof body.name !== "string" || !body.name.trim() ||
    typeof body.email !== "string" || !/.+@.+\..+/.test(body.email) ||
    typeof body.password !== "string" || body.password.length < 8
  ) {
    return NextResponse.json(
      { error: { message: "Provide a name, a valid email, and a password of at least 8 characters" } },
      { status: 400 }
    );
  }
  const user = createUser(body.name.trim(), body.email, body.password, "super_admin");
  const token = createSession(user.id);
  const res = NextResponse.json({ data: { ok: true, user } }, { status: 201 });
  res.cookies.set("sf_session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return res;
}
