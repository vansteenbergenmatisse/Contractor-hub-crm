import type { SaveResult, SaveStatus } from "../types";
import { labelOfKey } from "./fields";

export const SAVE_FAILED = "Could not save. Nothing new was confirmed. Try again.";
export const SAVE_LIMITED = "Too many saves. Try again later.";

const SENTENCE: Partial<Record<SaveStatus, (labels: string) => string>> = {
  invalid: (labels) => `${labels} could not be saved. Check the value.`,
  missing: (labels) => `${labels} does not exist in your account yet, so it was not saved.`,
  denied: (labels) => `${labels} cannot be changed here.`,
  rejected: (labels) => `Your account refused ${labels}.`,
  permission: (labels) => `${labels} did not save. Your account connection needs attention.`,
  retry: (labels) => `${labels} did not save. Try again.`,
};

export const isSaved = (status: SaveStatus) => status === "saved" || status === "unchanged";

// One message for everything that did not save, naming fields by their label. Null: all saved.
export function saveProblem(results: readonly SaveResult[]): string | null {
  const parts: string[] = [];
  for (const result of results) {
    if (result.status === "conflict") parts.push(`${labelOfKey(result.key)} changed in your account to ${result.current ?? "a new value"}. Check it and save again.`);
  }
  for (const [status, sentence] of Object.entries(SENTENCE) as [SaveStatus, (labels: string) => string][]) {
    const labels = results.filter((result) => result.status === status).map((result) => labelOfKey(result.key));
    if (labels.length > 0) parts.push(sentence(labels.join(", ")));
  }
  return parts.length > 0 ? parts.join(" ") : null;
}
