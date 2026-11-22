// Fetching a client's logo on the server (for the home-screen icon). The link is a custom value that
// anyone with access to the sub-account in HighLevel can edit, so it is treated as untrusted:
// https only, an allowed host only, no redirect followed, a short timeout, a size cap and an image
// content type. Anything else gives null and the caller draws the initials instead.
const DEFAULT_HOSTS = ["assets.cdn.filesafe.space"]; // HighLevel's media host seen in a real sub-account
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);
export const MAX_LOGO_BYTES = 512 * 1024;
export const LOGO_TIMEOUT_MS = 4000;

// The default host plus any in LOGO_HOST_ALLOWLIST (comma separated host names, exact match).
export function allowedLogoHosts(extra: string | undefined = process.env.LOGO_HOST_ALLOWLIST): string[] {
  const more = (extra ?? "").split(",").map((h) => h.trim().toLowerCase()).filter((h) => /^[a-z0-9.-]+$/.test(h));
  return [...new Set([...DEFAULT_HOSTS, ...more])];
}

export function isAllowedLogoUrl(raw: string, hosts: readonly string[]): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.username === "" && url.password === "" && (url.port === "" || url.port === "443") && hosts.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export async function fetchLogoDataUri(
  raw: string,
  options: { hosts?: readonly string[]; fetch?: typeof fetch; timeoutMs?: number; maxBytes?: number } = {},
): Promise<string | null> {
  const hosts = options.hosts ?? allowedLogoHosts();
  const maxBytes = options.maxBytes ?? MAX_LOGO_BYTES;
  if (!isAllowedLogoUrl(raw, hosts)) return null;
  try {
    const response = await (options.fetch ?? fetch)(raw, {
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? LOGO_TIMEOUT_MS),
      headers: { accept: "image/*" },
    });
    if (response.status !== 200 || !response.body) return null;
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.has(type)) return null;
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
    if (total === 0) return null;
    return `data:${type};base64,${Buffer.concat(chunks).toString("base64")}`;
  } catch {
    return null;
  }
}
