import type { SaveAnswer, SaveOptions, SaveResult, ValueChange } from "@/features/settings";

// The browser's call to this app's save route. HighLevel is only ever called by the server.
export async function sendValues(changes: ValueChange[], options?: SaveOptions): Promise<SaveAnswer> {
  try {
    const response = await fetch("/api/settings/values", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(options ? { changes, unlocked: options.unlocked } : { changes }),
    });
    if (response.status === 429) return { kind: "limited" };
    if (!response.ok) return { kind: "failed" };
    const body = (await response.json()) as { results?: SaveResult[] };
    return Array.isArray(body.results) ? { kind: "results", results: body.results } : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}
