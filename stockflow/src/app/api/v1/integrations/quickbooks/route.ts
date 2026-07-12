import { json, route } from "@/lib/api";
import { ApiError, validate } from "@/lib/util";
import { getQboConfig, saveQboConfig, type QboConfig } from "@/lib/qbo";

function masked(cfg: QboConfig) {
  return {
    enabled: cfg.enabled,
    environment: cfg.environment,
    client_id: cfg.client_id,
    realm_id: cfg.realm_id,
    has_client_secret: !!cfg.client_secret,
    has_refresh_token: !!cfg.refresh_token,
  };
}

export const GET = route({ write: true }, () => json({ data: masked(getQboConfig()) }));

/** Update settings. Secret fields left blank are kept unchanged. */
export const PUT = route({ write: true }, async (req) => {
  const body = validate(await req.json(), {
    enabled: { type: "boolean" },
    environment: { type: "string", enum: ["sandbox", "production"] },
    client_id: { type: "string" },
    client_secret: { type: "string" },
    refresh_token: { type: "string" },
    realm_id: { type: "string" },
    api_base: { type: "string" },
    token_url: { type: "string" },
  });
  const patch: Record<string, string | number | boolean> = { ...body };
  for (const key of ["client_secret", "refresh_token"]) {
    if (patch[key] === "") delete patch[key];
  }
  const next = { ...getQboConfig(), ...patch } as QboConfig;
  if (next.enabled && (!next.client_id || !next.client_secret || !next.refresh_token || !next.realm_id))
    throw new ApiError(422, "Cannot enable sync without client ID, client secret, refresh token, and company (realm) ID");
  return json({ data: masked(saveQboConfig(patch)) });
});
