import crypto from "node:crypto";

export const SESSION_COOKIE = "sf_session";

/**
 * The UI password gate is enabled by setting STOCKFLOW_PASSWORD.
 * The session cookie is a deterministic HMAC derived from the password,
 * so logins survive server restarts and changing the password invalidates
 * every existing session.
 */
export function gatePassword(): string | undefined {
  return process.env.STOCKFLOW_PASSWORD || undefined;
}

export function sessionToken(password: string): string {
  return crypto.createHmac("sha256", password).update("stockflow-ui-v1").digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Extract and verify the session cookie from a raw Cookie header. */
export function hasValidSession(cookieHeader: string | null): boolean {
  const password = gatePassword();
  if (!password) return true;
  const match = /(?:^|;\s*)sf_session=([^;]+)/.exec(cookieHeader || "");
  return !!match && safeEqual(match[1], sessionToken(password));
}
