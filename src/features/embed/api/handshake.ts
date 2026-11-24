// The browser side of /embed: ask HighLevel's page (the parent window) for the encrypted user data,
// hand it to the server, report what happened. Windows and fetch are injected so this runs in tests.
// HighLevel's docs give no timeout or retry rule and name no parent origin, so: the answer is only
// accepted from the parent window itself, the request is repeated every second, and it gives up after
// `giveUpAfterMs`.
import { EMBED_DENIAL_HEADER, isEmbedDenialCode, type EmbedDenialCode } from "./denial";

export type HandshakeResult = "signed_in" | "no_access" | "no_data" | "not_embedded";

type MessageEventLike = { source: unknown; data: unknown };

export type HandshakeDeps = {
  parent: { postMessage(message: unknown, targetOrigin: string): void };
  self: unknown;
  listen: (handler: (event: MessageEventLike) => void) => () => void;
  fetchImpl: (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string; credentials: "same-origin" },
  ) => Promise<{ ok: boolean; status: number; headers?: { get(name: string): string | null }; json?: () => Promise<unknown> }>;
  // With "no_access", why: the server's public code on a 403, else "other".
  onResult: (result: HandshakeResult, denial?: EmbedDenialCode) => void;
  // Called before "signed_in" when the server also gave a single-use handoff token (to continue
  // full-screen). Only a well-formed token is passed on.
  onHandoff?: (token: string) => void;
  retryEveryMs: number;
  giveUpAfterMs: number;
};

export function startHandshake(deps: HandshakeDeps): () => void {
  if (deps.parent === deps.self) {
    deps.onResult("not_embedded");
    return () => {};
  }
  let finished = false;
  let sent = false;
  const finish = (result: HandshakeResult, denial?: EmbedDenialCode) => {
    if (finished) return;
    finished = true;
    stop();
    if (denial) deps.onResult(result, denial);
    else deps.onResult(result);
  };
  // Only a 403 carries a reason; anything else (rate limit, server error) is "other".
  const denialOf = (response: { status: number; headers?: { get(name: string): string | null } }): EmbedDenialCode => {
    if (response.status !== 403) return "other";
    const code = response.headers?.get(EMBED_DENIAL_HEADER) ?? null;
    return isEmbedDenialCode(code) ? code : "other";
  };
  const ask = () => deps.parent.postMessage({ message: "REQUEST_USER_DATA" }, "*");

  const removeListener = deps.listen((event) => {
    if (finished || sent || event.source !== deps.parent) return;
    const data = event.data as { message?: unknown; payload?: unknown } | null;
    if (typeof data !== "object" || data === null || data.message !== "REQUEST_USER_DATA_RESPONSE") return;
    if (typeof data.payload !== "string" || data.payload.length === 0) return;
    sent = true;
    clearInterval(retry);
    clearTimeout(giveUp);
    deps
      .fetchImpl("/api/auth/embed-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload: data.payload }),
        credentials: "same-origin",
      })
      .then(async (response) => {
        if (!response.ok) return finish("no_access", denialOf(response));
        if (deps.onHandoff && response.json) {
          const body = (await response.json().catch(() => null)) as { handoff?: unknown } | null;
          const token = body?.handoff;
          if (!finished && typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token)) deps.onHandoff(token);
        }
        finish("signed_in");
      })
      .catch(() => finish("no_access", "other"));
  });
  const retry = setInterval(ask, deps.retryEveryMs);
  const giveUp = setTimeout(() => finish("no_data"), deps.giveUpAfterMs);
  function stop() {
    clearInterval(retry);
    clearTimeout(giveUp);
    removeListener();
  }
  ask();
  return () => {
    finished = true;
    stop();
  };
}
