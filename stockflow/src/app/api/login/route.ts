import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  createSession,
  destroySession,
  sessionTokenFromCookie,
  verifyPassword,
} from "@/lib/users";
import { now } from "@/lib/util";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (typeof body.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: { message: "Email and password are required" } }, { status: 400 });
  }
  const db = getDb();
  const user = db
    .prepare("SELECT id, password_hash, active FROM users WHERE email = ?")
    .get(body.email.toLowerCase().trim()) as { id: string; password_hash: string; active: number } | undefined;
  if (!user || !user.active || !verifyPassword(body.password, user.password_hash)) {
    return NextResponse.json({ error: { message: "Incorrect email or password" } }, { status: 401 });
  }
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(now(), user.id);
  const token = createSession(user.id);
  const res = NextResponse.json({ data: { ok: true } });
  res.cookies.set("sf_session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return res;
}

/** Log out: destroy the session server-side and clear the cookie. */
export async function DELETE(req: Request) {
  const token = sessionTokenFromCookie(req.headers.get("cookie"));
  if (token) destroySession(token);
  const res = NextResponse.json({ data: { ok: true } });
  res.cookies.set("sf_session", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
