import { createHmac } from "node:crypto";
import type { CopyPreview, KeyState, PlanEntry, TemplateCopyConfig, ValueRow } from "../types";

const TENANT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const IMAGE_FILE = /\.(png|jpe?g|webp|gif|svg)$/i;

type FlagEnv = Record<string, string | undefined>;

// Off unless TEMPLATE_COPY_ENABLED is exactly "true" and TEMPLATE_TENANT_ID is a well-formed CRM tenant
// id. The template id is only ever read here, never from a request.
export function templateCopyConfig(env: FlagEnv = process.env): TemplateCopyConfig {
  const id = (env.TEMPLATE_TENANT_ID ?? "").trim();
  const templateTenantId = TENANT_ID.test(id) ? id : null;
  return { enabled: env.TEMPLATE_COPY_ENABLED === "true" && templateTenantId !== null, templateTenantId };
}

export const isTenantId = (value: string): boolean => TENANT_ID.test(value);

function httpsUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return null;
    return url;
  } catch {
    return null;
  }
}

// An image link: an https URL on an allowed media host, or any https URL whose path ends in an image
// extension. A media-host link that turns out not to be an image is refused later, never linked.
export function isImageLink(value: string, hosts: readonly string[]): boolean {
  const url = httpsUrl(value);
  if (!url) return false;
  return hosts.includes(url.hostname.toLowerCase()) || IMAGE_FILE.test(url.pathname);
}

export function isAllowedMediaUrl(value: string, hosts: readonly string[]): boolean {
  const url = httpsUrl(value);
  return !!url && (url.port === "" || url.port === "443") && hosts.includes(url.hostname.toLowerCase());
}

// An opaque stand-in for a target value the admin saw in the preview: the apply step writes over a
// filled value only while it still has this token. Keyed, so a secret value cannot be guessed from it.
export function valueToken(secret: string, tenantId: string, key: string, value: string): string {
  const subkey = createHmac("sha256", secret).update("template-copy-v1").digest();
  return createHmac("sha256", subkey).update(JSON.stringify([tenantId, key, value.trim()])).digest("base64url").slice(0, 32);
}

// Every template key against the target, matched by key. Values compare trimmed.
export function planCopy(
  template: readonly ValueRow[],
  target: readonly ValueRow[],
  options: { targetDuplicates?: readonly string[]; isImage: (value: string) => boolean; isSecret: (key: string) => boolean },
): PlanEntry[] {
  const targetByKey = new Map(target.map((row) => [row.key, row.value]));
  const duplicates = new Set(options.targetDuplicates ?? []);
  return template.map((row) => {
    const value = row.value.trim();
    const current = targetByKey.get(row.key);
    let state: KeyState;
    if (value === "") state = "template_blank";
    else if (duplicates.has(row.key)) state = "duplicate";
    else if (current === undefined) state = "missing";
    else if (current.trim() === "") state = "fill";
    else state = current.trim() === value ? "same" : "different";
    return { key: row.key, state, template: value, target: current === undefined ? null : current.trim(), image: value !== "" && options.isImage(value), secret: options.isSecret(row.key) };
  });
}

// The admin's preview: names and counts; a value only for a key that is not secret-looking.
export function toPreview(plan: readonly PlanEntry[], tokenOf: (key: string, value: string) => string, templateDuplicates: readonly string[] = []): CopyPreview {
  const of = (state: KeyState) => plan.filter((entry) => entry.state === state);
  const fill = of("fill").map((e) => (e.secret ? { key: e.key, image: e.image } : { key: e.key, image: e.image, value: e.template }));
  const different = of("different").map((e) => ({
    key: e.key,
    image: e.image,
    token: tokenOf(e.key, e.target ?? ""),
    ...(e.secret ? {} : { templateValue: e.template, targetValue: e.target ?? "" }),
  }));
  const duplicates = [...new Set([...of("duplicate").map((e) => e.key), ...templateDuplicates])];
  return {
    counts: {
      templateKeys: plan.length,
      fill: fill.length,
      same: of("same").length,
      different: different.length,
      missing: of("missing").length,
      duplicates: duplicates.length,
      templateBlank: of("template_blank").length,
      images: plan.filter((e) => e.image).length,
      hidden: plan.filter((e) => e.secret).length,
    },
    fill,
    same: of("same").map((e) => e.key),
    different,
    missing: of("missing").map((e) => e.key),
    duplicates,
    images: plan.filter((e) => e.image).map((e) => e.key),
  };
}
