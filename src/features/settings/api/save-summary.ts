import type { SaveResult, SaveStatus } from "../types";
import { labelOfKey } from "./fields";

export const SAVE_FAILED = "Could not save. Nothing new was confirmed. Try again.";
export const SAVE_LIMITED = "Too many saves. Try again later.";

const SENTENCE: Partial<Record<SaveStatus, (labels: string) => string>> = {
  invalid: (labels) => `${labels} could not be saved. Check the value.`,
  missing: (labels) => `${labels} does not exist in your account yet, so it was not saved.`,
  duplicate: (labels) => `${labels} is listed twice in your account, so it was not saved. Ask Forge Forward to fix it.`,
  denied: (labels) => `${labels} cannot be changed here.`,
  locked: (labels) => `${labels} is locked by Forge Forward. Ask us to change it.`,
  rejected: (labels) => `Your account refused ${labels}.`,
  permission: (labels) => `${labels} did not save. Your account connection needs attention.`,
  retry: (labels) => `${labels} did not save. Try again.`,
  unknown: (labels) => `We could not confirm ${labels}. Reload this page to see what your account holds.`,
  busy: (labels) => `${labels} did not save because another save is running. Try again in a moment.`,
};

export const isSaved = (status: SaveStatus) => status === "saved" || status === "unchanged";

// One message for everything that did not save, naming fields by their label. Null: all saved.
export function saveProblem(results: readonly SaveResult[]): string | null {
  const parts: string[] = [];
  for (const result of results) {
    if (result.status === "conflict") parts.push(`${labelOfKey(result.key)} changed in your account to ${result.current ?? "a new value"}. Check it and save again.`);
  }
  // Unconfirmed, and the read shows a third value: say what the account holds now.
  const mismatched = (result: SaveResult) => result.status === "unknown" && result.current !== undefined;
  for (const result of results.filter(mismatched)) {
    const now = result.current?.trim() ? result.current : "an empty value";
    parts.push(`${labelOfKey(result.key)} did not save as you typed it. Your account now holds ${now}. Check it and save again.`);
  }
  for (const [status, sentence] of Object.entries(SENTENCE) as [SaveStatus, (labels: string) => string][]) {
    const labels = results.filter((result) => result.status === status && !mismatched(result)).map((result) => labelOfKey(result.key));
    if (labels.length > 0) parts.push(sentence(labels.join(", ")));
  }
  return parts.length > 0 ? parts.join(" ") : null;
}
