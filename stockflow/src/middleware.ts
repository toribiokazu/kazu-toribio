import { NextRequest, NextResponse } from "next/server";

/**
 * UI password gate. Active only when STOCKFLOW_PASSWORD is set.
 * /api/* is excluded — the API layer enforces its own auth (API keys, and
 * the same session cookie for browser requests; see src/lib/auth.ts).
 *
 * Runs on the edge runtime, so the expected token is recomputed here with
 * Web Crypto; it matches sessionToken() in src/lib/session.ts.
 */
export async function middleware(req: NextRequest) {
  const password = process.env.STOCKFLOW_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api")) return NextResponse.next();

  const cookie = req.cookies.get("sf_session")?.value;
  if (cookie && cookie === (await expectedToken(password))) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

async function expectedToken(password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("stockflow-ui-v1"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
