import { OAUTH_SCOPES } from "./scopes";
import { canBind, newState, stateCookie } from "./oauth-state";
import type { OAuthStartConfig } from "../types";

export type OAuthStartDeps = {
  config: OAuthStartConfig;
  // Only a Forge Forward admin may start an install. Any false or thrown result denies.
  isAdmin: (request: Request) => Promise<boolean>;
  // The signed-in admin's user id. When given, it must be non-empty (else 403) and is bound into the
  // state, so /callback accepts the state only for that admin's session.
  getAdminId?: (request: Request) => Promise<string | null>;
  // Server secret the state is signed with (TOKEN_ENCRYPTION_KEY in production).
  stateSecret: string;
  now?: () => Date;
};

export async function handleOAuthStart(request: Request, deps: OAuthStartDeps): Promise<Response> {
  let allowed = false;
  try {
    allowed = (await deps.isAdmin(request)) === true;
  } catch {
    allowed = false;
  }
  if (!allowed) {
    return new Response("Forbidden", { status: 403, headers: { "cache-control": "no-store" } });
  }
  let adminId: string | undefined;
  if (deps.getAdminId) {
    try {
      const id = await deps.getAdminId(request);
      if (typeof id === "string" && canBind(id)) adminId = id;
    } catch {
      adminId = undefined;
    }
    if (adminId === undefined) {
      return new Response("Forbidden", { status: 403, headers: { "cache-control": "no-store" } });
    }
  }
  const state = newState(deps.stateSecret, (deps.now ?? (() => new Date()))(), adminId);
  // Path from HighLevel's docs/oauth/Authorization.md. A white-labeled app installs on
  // marketplace.leadconnectorhq.com, set through GHL_INSTALL_BASE_URL.
  const url = new URL("/v2/oauth/chooselocation", deps.config.installBaseUrl);
  const query = new URLSearchParams({
    response_type: "code",
    client_id: deps.config.clientId,
    redirect_uri: deps.config.redirectUri,
    scope: (deps.config.scopes ?? OAUTH_SCOPES).join(" "),
    state,
  });
  // A draft Marketplace app only installs with its version id.
  const versionId = deps.config.versionId?.trim();
  if (versionId) query.set("version_id", versionId);
  url.search = query.toString();
  return new Response(null, {
    status: 302,
    headers: {
      location: url.toString(),
      "set-cookie": stateCookie(state),
      "cache-control": "no-store",
    },
  });
}
