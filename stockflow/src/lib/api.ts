import { NextResponse } from "next/server";
import { authenticate, type Auth } from "./auth";
import { ApiError } from "./util";

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>>; auth: Auth }) => Promise<Response> | Response;

/**
 * Wrap a /api/v1 route handler with authentication and uniform error JSON.
 * Pass write: true for handlers that mutate data (blocks read-only keys).
 */
export function route(opts: { write: boolean }, handler: Handler) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      const auth = authenticate(req, opts.write);
      return await handler(req, { ...ctx, auth });
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: { message: err.message } }, { status: err.status });
      }
      if (err instanceof SyntaxError) {
        return NextResponse.json({ error: { message: "Invalid JSON body" } }, { status: 400 });
      }
      const message = err instanceof Error ? err.message : "Internal error";
      // SQLite constraint violations are client errors (duplicate SKU etc).
      if (/UNIQUE constraint failed/.test(message)) {
        return NextResponse.json(
          { error: { message: "A record with that unique value already exists" } },
          { status: 409 }
        );
      }
      if (/FOREIGN KEY constraint failed/.test(message)) {
        return NextResponse.json(
          { error: { message: "Referenced record does not exist or is still in use" } },
          { status: 409 }
        );
      }
      console.error("API error:", err);
      return NextResponse.json({ error: { message: "Internal server error" } }, { status: 500 });
    }
  };
}

export function json(data: unknown, status = 200): Response {
  return NextResponse.json(data, { status });
}
