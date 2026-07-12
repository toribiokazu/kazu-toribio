import { EVENT_TYPES } from "./events";
import { ApiError } from "./util";

export function validateEventList(input: unknown): string[] {
  if (input === undefined) return ["*"];
  if (!Array.isArray(input) || input.length === 0 || !input.every((e) => typeof e === "string"))
    throw new ApiError(400, "Field 'events' must be a non-empty array of strings");
  const known = new Set<string>(EVENT_TYPES);
  for (const pattern of input) {
    const ok =
      pattern === "*" ||
      known.has(pattern) ||
      (pattern.endsWith(".*") && [...known].some((t) => t.startsWith(pattern.slice(0, -1))));
    if (!ok) throw new ApiError(400, `Unknown event type or pattern: '${pattern}'`);
  }
  return input;
}

export function validateUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ApiError(400, "Field 'url' must be a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new ApiError(400, "Webhook URL must use http or https");
}
