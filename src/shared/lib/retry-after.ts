// Reads an HTTP Retry-After header (whole seconds or an HTTP date) as seconds to wait from `nowMs`.
// Null means the value is missing or unusable, so the caller picks its own wait.
export function parseRetryAfter(value: string | null | undefined, nowMs: number): number | null {
  const text = value?.trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) {
    const seconds = Number(text);
    return Number.isSafeInteger(seconds) ? seconds : null;
  }
  if (!/[a-z]{3}.*\d{4}/i.test(text)) return null;
  const at = Date.parse(text);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - nowMs) / 1000));
}
