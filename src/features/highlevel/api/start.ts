import { OAUTH_SCOPES } from "./scopes";
import { newState, stateCookie } from "./oauth-state";
import type { OAuthStartConfig } from "../types";

export type OAuthStartDeps = {
  config: OAuthStartConfig;
  // Only a Forge Forward admin may start an install. Any false or thrown result denies.
  isAdmin: (request: Request) => Promise<boolean>;
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
  const state = newState(deps.stateSecret, (deps.now ?? (() => new Date()))());
  const url = new URL("/oauth/chooselocation", deps.config.installBaseUrl);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: deps.config.clientId,
    redirect_uri: deps.config.redirectUri,
    scope: OAUTH_SCOPES.join(" "),
    state,
  }).toString();
  return new Response(null, {
    status: 302,
    headers: {
      location: url.toString(),
      "set-cookie": stateCookie(state),
      "cache-control": "no-store",
    },
  });
}
