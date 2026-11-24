import type { CopyBatch, PreviewAnswer, TemplateCopyConfig } from "../types";
import { isTenantId } from "./plan";

// POST /api/admin/clients/[tenantId]/copy-template. Admin only, same Origin, JSON only, refused during
// View as client, behind TEMPLATE_COPY_ENABLED, rate limited. The target comes from the URL; the
// template only from the server's config, never from the request.
export type TemplateCopyRouteDeps = {
  adminId: (request: Request) => Promise<string | null>;
  // True while this admin has a valid View as client cookie.
  isViewing: (request: Request) => Promise<boolean>;
  limiter: (key: string) => Promise<boolean>;
  appOrigin: string;
  config: TemplateCopyConfig;
  preview: (input: { targetTenantId: string; templateTenantId: string }) => Promise<PreviewAnswer>;
  apply: (input: { targetTenantId: string; templateTenantId: string; actorId: string; overwrite: Record<string, string>; skip: Set<string> }) => Promise<CopyBatch>;
};

const HEADERS = { "cache-control": "no-store", "content-type": "application/json" };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const KEY = /^[A-Za-z0-9_]{1,100}$/;
const TOKEN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_KEYS = 1_000;

function audit(event: string, fields: Record<string, string>) {
  console.info(JSON.stringify({ audit: event, ...fields }));
}

type Body = { action: "preview" } | { action: "apply"; overwrite: Record<string, string>; skip: Set<string> };

function parseBody(raw: unknown): Body | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  if (body.action === "preview") return Object.keys(body).length === 1 ? { action: "preview" } : null;
  if (body.action !== "apply") return null;
  if (Object.keys(body).some((k) => k !== "action" && k !== "overwrite" && k !== "skip")) return null;
  const overwrite: Record<string, string> = {};
  if (body.overwrite !== undefined) {
    if (typeof body.overwrite !== "object" || body.overwrite === null || Array.isArray(body.overwrite)) return null;
    const entries = Object.entries(body.overwrite as Record<string, unknown>);
    if (entries.length > MAX_KEYS) return null;
    for (const [key, token] of entries) {
      if (!KEY.test(key) || typeof token !== "string" || !TOKEN.test(token)) return null;
      overwrite[key] = token;
    }
  }
  const skip = new Set<string>();
  if (body.skip !== undefined) {
    if (!Array.isArray(body.skip) || body.skip.length > MAX_KEYS) return null;
    for (const key of body.skip) {
      if (typeof key !== "string" || !KEY.test(key)) return null;
      skip.add(key);
    }
  }
  return { action: "apply", overwrite, skip };
}

export async function handleTemplateCopy(request: Request, tenantId: string, deps: TemplateCopyRouteDeps): Promise<Response> {
  if (request.headers.get("origin") !== deps.appOrigin) return reply(403, { error: "forbidden" });
  const admin = await deps.adminId(request);
  if (admin === null) return reply(403, { error: "forbidden" });
  if (await deps.isViewing(request).catch(() => true)) return reply(403, { error: "viewing" });
  const templateTenantId = deps.config.templateTenantId;
  if (!deps.config.enabled || !templateTenantId) return reply(404, { error: "not_found" });
  let allowed = false;
  try {
    allowed = await deps.limiter(`template-copy:${admin}`);
  } catch {
    allowed = false;
  }
  if (!allowed) return reply(429, { error: "rate_limited" });
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return reply(415, { error: "unsupported" });
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return reply(400, { error: "invalid_request" });
  }
  const body = parseBody(raw);
  if (!body || !isTenantId(tenantId)) return reply(400, { error: "invalid_request" });
  if (tenantId === templateTenantId) return reply(400, { error: "same_tenant" });

  if (body.action === "preview") {
    audit("template_copy_preview", { by: admin, tenantId });
    const answer = await deps.preview({ targetTenantId: tenantId, templateTenantId });
    return answer.status === "ok" ? reply(200, answer.preview) : reply(409, { error: answer.status });
  }
  audit("template_copy_apply", { by: admin, tenantId, overwrite: String(Object.keys(body.overwrite).length), skip: String(body.skip.size) });
  const batch = await deps.apply({ targetTenantId: tenantId, templateTenantId, actorId: admin, overwrite: body.overwrite, skip: body.skip });
  if (batch.status !== "ok") return reply(409, { error: batch.status });
  audit("template_copy_batch", { by: admin, tenantId, results: String(batch.results.length), remaining: String(batch.remaining) });
  return reply(200, batch);
}
