// The export with JavaScript: a JSON post answers with a real status, so a failure never leaves the
// page, and the file is saved from a blob only after a 200 that really is a CSV.
import { afterPause } from "@/shared/lib/after-pause";
import { postExport } from "./save-lead";

export type ExportOutcome = "ok" | "busy" | "failed" | "forbidden";

const FALLBACK_NAME = "leads.csv";
const REVOKE_AFTER_MS = 10_000;

export const canDownloadInPage = () => typeof globalThis.fetch === "function" && typeof URL.createObjectURL === "function";

function saveFile(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking at once can cancel the save in some browsers.
  afterPause(() => URL.revokeObjectURL(href), REVOKE_AFTER_MS);
}

async function run(includeContact: boolean, signal: AbortSignal): Promise<ExportOutcome> {
  const response = await postExport(includeContact, signal);
  if (response.status === 403) return "forbidden";
  if (response.status === 429) return "busy";
  if (response.status !== 200 || !response.headers.get("content-type")?.startsWith("text/csv")) return "failed";
  const blob = await response.blob();
  if (signal.aborted) return "failed";
  const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? FALLBACK_NAME;
  saveFile(blob, name);
  return "ok";
}

// Settles on abort even if the body never ends, so the button cannot stay busy.
export function downloadExport(includeContact: boolean, signal: AbortSignal): Promise<ExportOutcome> {
  const aborted = new Promise<ExportOutcome>((resolve) => {
    if (signal.aborted) resolve("failed");
    signal.addEventListener("abort", () => resolve("failed"), { once: true });
  });
  return Promise.race([run(includeContact, signal).catch((): ExportOutcome => "failed"), aborted]);
}
