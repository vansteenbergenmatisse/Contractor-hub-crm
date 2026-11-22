// The link as a clean https URL (`URL.href`, so quotes and spaces come out percent-encoded), or null
// for anything else: another protocol, text that is not a URL, an empty value.
export function safeHttpsUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
