import { canSeeMailboxPrompt } from "./service";
import type { PromptUser } from "../types";

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "cache-control": "no-store", "content-type": "application/json" } });

// The body is never read: user and tenant come from the session only. An exact Origin match is
// required, so a request without one is refused too.
export async function handleDismiss(
  request: Request,
  deps: {
    appOrigin: string;
    currentUser: (request: Request) => Promise<PromptUser | null>;
    dismiss: (user: PromptUser) => Promise<boolean>;
  },
): Promise<Response> {
  if (request.headers.get("origin") !== deps.appOrigin) return reply(403, { error: "forbidden" });
  const user = await deps.currentUser(request);
  if (!user) return reply(401, { error: "unauthorized" });
  if (!canSeeMailboxPrompt(user)) return reply(403, { error: "forbidden" });
  return (await deps.dismiss(user)) ? reply(200, { ok: true }) : reply(500, { error: "failed" });
}

export const dismissFailure = () => reply(500, { error: "failed" });
