import { afterPause } from "@/shared/lib/after-pause";
import type { AddressSuggestion } from "@/shared/lib/places-search";
import type { LeadOrigin } from "../types";

export type LeadSaveInput = { name: string; phone: string; email: string; address: string; source: LeadOrigin };
export type LeadSaveResult = "created" | "duplicate" | "in_progress" | "invalid_phone" | "unsure" | "failed";

// Longer than the server's two duplicate searches plus its one create.
const SAVE_TIMEOUT_MS = 45_000;
const SEARCH_TIMEOUT_MS = 5_000;
const KNOWN: readonly string[] = ["created", "duplicate", "in_progress", "invalid_phone", "unsure", "failed"];

// What the owner reads when a lead was not plainly saved. The draft stays in the form for all of them.
export const SAVE_PROBLEM: Record<Exclude<LeadSaveResult, "created" | "invalid_phone">, string> = {
  duplicate: "This phone or email is already in your CRM. Nothing was added.",
  in_progress: "This lead is already being saved. Check Leads in a minute before trying again.",
  unsure: "We could not confirm this lead was saved. Check Leads before adding it again.",
  failed: "This lead was not saved. Try again.",
};

// A lost answer may still have created the contact, so it is "unsure", never "failed".
export async function postLead(input: LeadSaveInput): Promise<LeadSaveResult> {
  const controller = new AbortController();
  const cancel = afterPause(() => controller.abort(), SAVE_TIMEOUT_MS);
  try {
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      credentials: "same-origin",
      signal: controller.signal,
    });
    if (response.status >= 500) return "unsure";
    if (!response.ok) return "failed";
    const json = (await response.json()) as { status?: unknown };
    return typeof json.status === "string" && KNOWN.includes(json.status) ? (json.status as LeadSaveResult) : "unsure";
  } catch {
    return "unsure";
  } finally {
    cancel();
  }
}

// Null: search is off or broken, so the field stays a plain address field.
export async function searchAddresses(input: string, sessionToken: string, signal: AbortSignal): Promise<AddressSuggestion[] | null> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  signal.addEventListener("abort", stop, { once: true });
  const cancel = afterPause(stop, SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch("/api/leads/address", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input, sessionToken }),
      credentials: "same-origin",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const json = (await response.json()) as { suggestions?: unknown };
    if (!Array.isArray(json.suggestions)) return null;
    return json.suggestions.filter((s): s is AddressSuggestion => typeof s?.id === "string" && typeof s?.text === "string");
  } catch {
    return null;
  } finally {
    cancel();
    signal.removeEventListener("abort", stop);
  }
}
