import { createHash } from "node:crypto";
import { isAllowedLogoUrl } from "@/features/brand";
import type { MediaFind, MediaUpload, MediaUploadOutcome } from "@/features/highlevel";
import type { ImageAnswer, ImageStatus } from "@/features/settings";
import { saveCustomValues, type AuditOutcome, type SaveDeps } from "./write-back";
import { MAX_IMAGE_BYTES } from "./webp-check";

// Change image: upload a NEW file to the client's media library, then point the custom value at it
// through the normal save rules. The old file is never deleted, renamed or changed. A failure at any
// step leaves the old value live; at worst an unused new file stays in the library.
const UPLOAD_CUTOFF_MS = 15_000;
// The save after this reads, PUTs and reads again at 10 seconds each: 25 + 30 stays inside the route's 60.
const PUT_CUTOFF_MS = 25_000;
const MAX_CANDIDATES = 2;

export type CheckedImage = { bytes: Uint8Array; contentType: string; extension: string; hash: string };
export type MediaDeps = SaveDeps & {
  find: (tenantId: string, name: string) => Promise<MediaFind>;
  upload: (tenantId: string, file: MediaUpload) => Promise<MediaUploadOutcome>;
  fetchBytes: (url: string, maxBytes: number) => Promise<Uint8Array | null>;
  hosts: readonly string[];
};
type Input = { tenantId: string; actorId: string; key: string; expected: string; file: CheckedImage };
type Run = { answer: ImageAnswer; keepLease: boolean };
type Located = { url: string } | { stop: ImageStatus } | null;

const stopped = (status: ImageStatus, keepLease = false): Run => ({ answer: { status }, keepLease });
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

// A name match is not proof: the file's real bytes must hash to the same value.
async function locate(input: Input, name: string, deps: MediaDeps): Promise<Located> {
  let found: MediaFind;
  try {
    found = await deps.find(input.tenantId, name);
  } catch {
    return { stop: "retry" };
  }
  if (!found.ok) return { stop: found.reason === "permission" ? "needs_approval" : found.reason };
  if (found.files.length === 0) return null;
  for (const file of found.files.slice(0, MAX_CANDIDATES)) {
    if (!isAllowedLogoUrl(file.url, deps.hosts)) return { stop: "bad_host" };
    const bytes = await deps.fetchBytes(file.url, MAX_IMAGE_BYTES).catch(() => null);
    if (!bytes) return { stop: "retry" };
    if (sha256(bytes) === input.file.hash) return { url: file.url };
  }
  return { stop: "hash_mismatch" };
}

async function closeAudit(id: string, outcome: AuditOutcome, deps: MediaDeps) {
  try {
    await deps.finish(id, outcome);
  } catch {
    console.error("Settings image failed: step=audit-finish");
  }
}

// One upload, never repeated. After no answer the library is read again; a file still absent is
// `unknown`, because the list may lag behind an upload that did land.
async function uploadNew(input: Input, name: string, deps: MediaDeps): Promise<{ url: string } | Run> {
  let auditId: string;
  try {
    auditId = await deps.begin({ tenantId: input.tenantId, actorId: input.actorId, key: input.key, previousValue: input.expected, newValue: `upload:${name}` });
  } catch {
    console.error("Settings image failed: step=audit-start");
    return stopped("retry");
  }
  const { bytes, contentType, extension } = input.file;
  let sent: MediaUploadOutcome;
  try {
    sent = await deps.upload(input.tenantId, { bytes, contentType, name, fileName: `${name}.${extension}` });
  } catch {
    sent = { kind: "no_answer" };
  }
  if (sent.kind === "uploaded") {
    await closeAudit(auditId, "saved", deps);
    return { url: sent.url };
  }
  if (sent.kind !== "no_answer") {
    const audit: AuditOutcome = sent.kind === "rejected" ? "rejected" : sent.kind === "permission" ? "permission" : "failed";
    await closeAudit(auditId, audit, deps);
    return stopped(sent.kind === "permission" ? "needs_approval" : sent.kind);
  }
  const again = await locate(input, name, deps);
  if (again && "url" in again) {
    await closeAudit(auditId, "saved", deps);
    return again;
  }
  if (again && (again.stop === "hash_mismatch" || again.stop === "bad_host")) {
    await closeAudit(auditId, "failed", deps);
    return stopped(again.stop);
  }
  await closeAudit(auditId, "unknown", deps);
  return stopped("unknown", true);
}

async function pointValueAt(input: Input, url: string, started: number, deps: MediaDeps): Promise<Run> {
  // This replace already holds the tenant's lease, so the save must not claim or release it.
  const { results } = await saveCustomValues(
    { tenantId: input.tenantId, actorId: input.actorId, changes: [{ key: input.key, expected: input.expected, value: url }] },
    { ...deps, claim: async () => "held", release: async () => {} },
    started,
  );
  const result = results[0];
  switch (result?.status) {
    case "saved":
    case "unchanged":
      return { answer: { status: "saved", url }, keepLease: false };
    case "conflict":
      return { answer: { status: "conflict", current: result.current }, keepLease: false };
    case "unknown":
      return stopped("unknown", true);
    case "permission":
      return stopped("connection");
    case "missing":
    case "duplicate":
    case "rejected":
    case "busy":
      return stopped(result.status);
    case "invalid":
    case "denied":
      return stopped("rejected");
    default:
      return stopped("retry");
  }
}

async function run(input: Input, deps: MediaDeps): Promise<Run> {
  const started = deps.now();
  const read = await deps.read(input.tenantId).catch(() => ({ ok: false as const, reason: "retry" as const }));
  if (!read.ok) return stopped(read.reason === "permission" ? "connection" : "retry");
  if ((read.duplicates ?? []).some((row) => row.key === input.key)) return stopped("duplicate");
  const row = read.values.find((item) => item.key === input.key);
  if (!row) return stopped("missing");
  const current = row.value.trim();
  if (current !== input.expected.trim()) return { answer: { status: "conflict", current }, keepLease: false };

  const name = `${input.key}-${input.file.hash.slice(0, 12)}`;
  const located = await locate(input, name, deps);
  if (located && "stop" in located) return stopped(located.stop);
  let url: string;
  if (located) url = located.url;
  else {
    if (deps.now() - started > UPLOAD_CUTOFF_MS) return stopped("retry");
    const uploaded = await uploadNew(input, name, deps);
    if (!("url" in uploaded)) return uploaded;
    url = uploaded.url;
  }
  // Never widened automatically: a host not on the list stops here, before the value changes.
  if (!isAllowedLogoUrl(url, deps.hosts)) return stopped("bad_host");
  if (deps.now() - started > PUT_CUTOFF_MS) return stopped("retry");
  return pointValueAt(input, url, started, deps);
}

export async function replaceImage(input: Input, deps: MediaDeps): Promise<ImageAnswer> {
  let holder: string | null;
  try {
    holder = await deps.claim(input.tenantId);
  } catch {
    console.error("Settings image failed: step=lease");
    return { status: "retry" };
  }
  if (!holder) return { status: "busy" };
  let keepLease = false;
  try {
    const result = await run(input, deps);
    keepLease = result.keepLease;
    return result.answer;
  } finally {
    // A call with no answer can still land: the lease stays until it expires.
    if (!keepLease) await deps.release(input.tenantId, holder).catch(() => console.error("Settings image failed: step=lease-release"));
  }
}
