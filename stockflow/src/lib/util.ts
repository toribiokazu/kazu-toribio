import crypto from "node:crypto";

export function id(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

export function now(): string {
  return new Date().toISOString();
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type FieldSpec = {
  required?: boolean;
  type: "string" | "number" | "boolean";
  enum?: readonly string[];
  min?: number;
};

/** Minimal request-body validator. Returns a sanitized object with only known keys. */
export function validate(
  body: unknown,
  spec: Record<string, FieldSpec>
): Record<string, string | number | boolean> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError(400, "Request body must be a JSON object");
  }
  const input = body as Record<string, unknown>;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, rule] of Object.entries(spec)) {
    const value = input[key];
    if (value === undefined || value === null) {
      if (rule.required) throw new ApiError(400, `Missing required field: ${key}`);
      continue;
    }
    if (rule.type === "number") {
      if (typeof value !== "number" || Number.isNaN(value))
        throw new ApiError(400, `Field '${key}' must be a number`);
      if (rule.min !== undefined && value < rule.min)
        throw new ApiError(400, `Field '${key}' must be >= ${rule.min}`);
      out[key] = value;
    } else if (rule.type === "boolean") {
      if (typeof value !== "boolean") throw new ApiError(400, `Field '${key}' must be a boolean`);
      out[key] = value;
    } else {
      if (typeof value !== "string") throw new ApiError(400, `Field '${key}' must be a string`);
      if (rule.required && value.trim() === "")
        throw new ApiError(400, `Field '${key}' must not be empty`);
      if (rule.enum && !rule.enum.includes(value))
        throw new ApiError(400, `Field '${key}' must be one of: ${rule.enum.join(", ")}`);
      out[key] = value;
    }
  }
  return out;
}

export function pagination(url: URL): { limit: number; offset: number } {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);
  return { limit, offset };
}
