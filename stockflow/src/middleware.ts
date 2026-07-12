import { NextRequest, NextResponse } from "next/server";

/**
 * Page-level login redirect. Real authentication and role checks happen in
 * the API layer (src/lib/auth.ts) — this only bounces visitors without a
 * session cookie to /login so pages don't flash before the client-side
 * guard kicks in. /api/* is excluded (it returns proper 401 JSON itself).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api")) return NextResponse.next();
  if (req.cookies.get("sf_session")?.value) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
