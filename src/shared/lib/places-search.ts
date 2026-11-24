export type AddressSuggestion = { id: string; text: string };

const PLACES_URL = "https://places.googleapis.com/v1/places:autocomplete";
const PLACES_FIELDS = "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text";

// Places API (New) Autocomplete. The key stays on the server.
export function createPlacesSearch(doFetch: typeof fetch = fetch) {
  return async (apiKey: string, input: string, sessionToken: string): Promise<AddressSuggestion[]> => {
    const response = await doFetch(PLACES_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey, "x-goog-fieldmask": PLACES_FIELDS },
      body: JSON.stringify({ input, sessionToken }),
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error("places");
    }
    const json = (await response.json()) as { suggestions?: Array<{ placePrediction?: { placeId?: unknown; text?: { text?: unknown } } }> };
    const out: AddressSuggestion[] = [];
    for (const row of Array.isArray(json.suggestions) ? json.suggestions : []) {
      const id = row?.placePrediction?.placeId;
      const text = row?.placePrediction?.text?.text;
      if (typeof id === "string" && typeof text === "string" && text) out.push({ id, text });
    }
    return out.slice(0, 5);
  };
}
