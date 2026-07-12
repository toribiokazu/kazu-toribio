import { NextResponse } from "next/server";
import { gatePassword, safeEqual, SESSION_COOKIE, sessionToken } from "@/lib/session";

export async function POST(req: Request) {
  const password = gatePassword();
  if (!password) {
    return NextResponse.json({ error: { message: "Password gate is not enabled" } }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  if (typeof body.password !== "string" || !safeEqual(body.password, password)) {
    return NextResponse.json({ error: { message: "Incorrect password" } }, { status: 401 });
  }
  const res = NextResponse.json({ data: { ok: true } });
  res.cookies.set(SESSION_COOKIE, sessionToken(password), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14, // two weeks
  });
  return res;
}

/** Log out: clear the session cookie. */
export async function DELETE() {
  const res = NextResponse.json({ data: { ok: true } });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
