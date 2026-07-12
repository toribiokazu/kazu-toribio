import { json, route } from "@/lib/api";
import { ApiError, validate } from "@/lib/util";
import { getZohoConfig, saveZohoConfig, type ZohoConfig } from "@/lib/zoho";

function masked(cfg: ZohoConfig) {
  return {
    enabled: cfg.enabled,
    dc: cfg.dc,
    client_id: cfg.client_id,
    has_client_secret: !!cfg.client_secret,
    has_refresh_token: !!cfg.refresh_token,
    stage_created: cfg.stage_created,
    stage_won: cfg.stage_won,
    stage_lost: cfg.stage_lost,
  };
}

export const GET = route({ write: true }, () => json({ data: masked(getZohoConfig()) }));

/** Update settings. Secret fields left blank are kept unchanged. */
export const PUT = route({ write: true }, async (req) => {
  const body = validate(await req.json(), {
    enabled: { type: "boolean" },
    dc: { type: "string", enum: ["com", "eu", "in", "com.au", "jp", "com.cn"] },
    client_id: { type: "string" },
    client_secret: { type: "string" },
    refresh_token: { type: "string" },
    stage_created: { type: "string" },
    stage_won: { type: "string" },
    stage_lost: { type: "string" },
    api_base: { type: "string" },
    accounts_base: { type: "string" },
  });
  const patch: Record<string, string | number | boolean> = { ...body };
  // Blank secrets mean "keep the stored value" so the UI never has to echo them.
  for (const key of ["client_secret", "refresh_token"]) {
    if (patch[key] === "") delete patch[key];
  }
  const current = getZohoConfig();
  const next = { ...current, ...patch } as ZohoConfig;
  if (next.enabled && (!next.client_id || !next.client_secret || !next.refresh_token))
    throw new ApiError(422, "Cannot enable sync without client ID, client secret, and refresh token");
  return json({ data: masked(saveZohoConfig(patch)) });
});
