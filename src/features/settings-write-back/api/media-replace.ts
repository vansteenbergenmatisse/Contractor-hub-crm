import { createHash } from "node:crypto";
import { isAllowedLogoUrl } from "@/features/brand";
import type { CustomValueRawRead, MediaFile, MediaFind, MediaTrashOutcome, MediaUpload, MediaUploadOutcome } from "@/features/highlevel";
import type { ImageAnswer, ImageFormat, ImageOldFile, ImageStatus } from "@/features/settings";
import { saveCustomValues, type AuditOutcome, type SaveDeps } from "./write-back";
import { MAX_IMAGE_BYTES } from "./webp-check";

// Change image REPLACES the file: the new one takes the old file's exact name and folder, the custom
// value moves to its URL, and only after a read-back confirms that does the old file go to the trash.
// The public API has no in-place replace. Until the read-back the old value and old file stay live.
const UPLOAD_CUTOFF_MS = 15_000;
// The save after this reads, PUTs and reads again at 10 seconds each: 25 + 30 stays inside the route's 60.
const PUT_CUTOFF_MS = 25_000;
// No removal starts later than this. The image has changed by then; the old file is reported as kept.
const REMOVE_CUTOFF_MS = 40_000;
const MAX_CANDIDATES = 8;

export type CheckedImage = { bytes: Uint8Array; contentType: string; extension: string; hash: string };
export type MediaDeps = SaveDeps & {
  find: (tenantId: string, url: string) => Promise<MediaFind>;
  verify: (tenantId: string, file: MediaFile) => Promise<boolean>;
  trash: (tenantId: string, fileId: string) => Promise<MediaTrashOutcome>;
  upload: (tenantId: string, file: MediaUpload) => Promise<MediaUploadOutcome>;
  fetchBytes: (url: string, maxBytes: number) => Promise<Uint8Array | null>;
  // Every row's raw value, for the in-use check before any file is removed.
  readAll: (tenantId: string) => Promise<CustomValueRawRead>;
  hosts: readonly string[];
};
type Input = { tenantId: string; actorId: string; key: string; expected: string; file: CheckedImage };
type Run = { answer: ImageAnswer; keepLease: boolean };
type Target = { file: MediaFile; uploadedNow: boolean };

const stopped = (status: ImageStatus, keepLease = false): Run => ({ answer: { status }, keepLease });
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const EXTENSIONS: Readonly<Record<string, ImageFormat | "other">> = {
  png: "png", jpg: "jpeg", jpeg: "jpeg", webp: "webp", svg: "svg",
  gif: "other", avif: "other", bmp: "other", tif: "other", tiff: "other", ico: "other", heic: "other",
};
const FORMAT_OF_TYPE: Readonly<Record<string, ImageFormat>> = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpeg", "image/svg+xml": "svg" };

function extensionFormat(text: string): ImageFormat | "other" | null {
  const match = /\.([a-z0-9]+)$/i.exec(text);
  return match ? (EXTENSIONS[match[1].toLowerCase()] ?? null) : null;
}

// The name decides. A name with no image extension falls back to the URL's path.
function formatOfFile(file: MediaFile): ImageFormat | "other" | null {
  const named = extensionFormat(file.name);
  if (named) return named;
  try {
    return extensionFormat(new URL(file.url).pathname);
  } catch {
    return null;
  }
}

async function closeAudit(id: string, outcome: AuditOutcome, deps: MediaDeps) {
  try {
    await deps.finish(id, outcome);
  } catch {
    console.error("Settings image failed: step=audit-finish");
  }
}

// The exact URL, exactly one live file. Anything else stops before the first write.
async function findOld(input: Input, url: string, deps: MediaDeps): Promise<{ old: MediaFile; siblings: MediaFile[] } | { stop: ImageStatus }> {
  let found: MediaFind;
  try {
    found = await deps.find(input.tenantId, url);
  } catch {
    return { stop: "retry" };
  }
  if (!found.ok) {
    if (found.reason === "permission") return { stop: "needs_approval" };
    return { stop: found.reason === "incomplete" ? "library_limit" : found.reason };
  }
  if (found.files.length === 0) return { stop: "not_found" };
  if (found.files.length > 1) return { stop: "ambiguous" };
  return { old: found.files[0], siblings: found.siblings };
}

// A same-name file in the folder may be this image from an earlier try. Its real bytes decide: the
// same bytes are reused, so no duplicate is made. Other bytes are simply another file, left alone.
// Every one is compared, or the run stops, because a skipped file could be the identical one.
async function matchSibling(input: Input, siblings: readonly MediaFile[], deps: MediaDeps): Promise<MediaFile | { stop: ImageStatus } | null> {
  if (siblings.length === 0) return null;
  if (siblings.length > MAX_CANDIDATES) return { stop: "ambiguous" };
  if (siblings.some((file) => !isAllowedLogoUrl(file.url, deps.hosts))) return { stop: "bad_host" };
  const all = await Promise.all(siblings.map((file) => deps.fetchBytes(file.url, MAX_IMAGE_BYTES).catch(() => null)));
  if (all.some((bytes) => !bytes)) return { stop: "retry" };
  const at = all.findIndex((bytes) => sha256(bytes as Uint8Array) === input.file.hash);
  return at >= 0 ? siblings[at] : null;
}

// The owner picked the image that is already live. A failed read just means it is not proven the same.
async function isCurrentImage(input: Input, old: MediaFile, deps: MediaDeps): Promise<boolean> {
  if (!isAllowedLogoUrl(old.url, deps.hosts)) return false;
  const bytes = await deps.fetchBytes(old.url, MAX_IMAGE_BYTES).catch(() => null);
  return !!bytes && sha256(bytes) === input.file.hash;
}

// One upload, never repeated. After no answer the library is read again; a file still absent is
// `unknown`, because the list may lag behind an upload that did land.
async function uploadNew(input: Input, old: MediaFile, before: readonly MediaFile[], deps: MediaDeps): Promise<Target | Run> {
  let auditId: string;
  try {
    auditId = await deps.begin({ tenantId: input.tenantId, actorId: input.actorId, key: input.key, previousValue: input.expected, newValue: `upload:${input.key}-${input.file.hash.slice(0, 12)}` });
  } catch {
    console.error("Settings image failed: step=audit-start");
    return stopped("retry");
  }
  const { bytes, contentType } = input.file;
  let sent: MediaUploadOutcome;
  try {
    sent = await deps.upload(input.tenantId, { bytes, contentType, name: old.name, fileName: old.name, parentId: old.parentId });
  } catch {
    sent = { kind: "no_answer" };
  }
  if (sent.kind === "uploaded") {
    await closeAudit(auditId, "saved", deps);
    return { file: { id: sent.fileId, name: old.name, url: sent.url, parentId: old.parentId }, uploadedNow: true };
  }
  if (sent.kind !== "no_answer") {
    const audit: AuditOutcome = sent.kind === "rejected" ? "rejected" : sent.kind === "permission" ? "permission" : "failed";
    await closeAudit(auditId, audit, deps);
    return stopped(sent.kind === "permission" ? "needs_approval" : sent.kind);
  }
  const again = await findOld(input, old.url, deps);
  if ("old" in again && again.old.id === old.id) {
    // Only a file that appeared since the first look can be this upload.
    const known = new Set(before.map((file) => file.id));
    const appeared = again.siblings.filter((file) => !known.has(file.id));
    const match = await matchSibling(input, appeared, deps);
    if (match && "id" in match) {
      await closeAudit(auditId, "saved", deps);
      return { file: match, uploadedNow: false };
    }
    if (!match && appeared.length > 0) {
      await closeAudit(auditId, "failed", deps);
      return stopped("hash_mismatch");
    }
    if (match?.stop === "bad_host") {
      await closeAudit(auditId, "failed", deps);
      return stopped("bad_host");
    }
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

// Audited, by exact id, after one last check that the library still lists this very file.
async function trashVerified(input: Input, file: MediaFile, started: number, deps: MediaDeps): Promise<MediaTrashOutcome | "not_verified"> {
  const verified = await deps.verify(input.tenantId, file).catch(() => false);
  if (!verified) return "not_verified";
  // The checks above take time: the trash call must still fit inside the route's limit.
  if (deps.now() - started > REMOVE_CUTOFF_MS) return "not_verified";
  let auditId: string;
  try {
    auditId = await deps.begin({ tenantId: input.tenantId, actorId: input.actorId, key: input.key, previousValue: file.url, newValue: `trash:${file.id}` });
  } catch {
    console.error("Settings image failed: step=audit-start");
    return "not_verified";
  }
  let outcome: MediaTrashOutcome;
  try {
    outcome = await deps.trash(input.tenantId, file.id);
  } catch {
    outcome = "unconfirmed";
  }
  await closeAudit(auditId, outcome === "trashed" ? "saved" : outcome === "unconfirmed" ? "unknown" : outcome === "permission" ? "permission" : "failed", deps);
  return outcome;
}

// Runs only after the read-back confirmed the new URL. A fresh read of every custom value decides.
async function removeOld(input: Input, old: MediaFile, target: MediaFile, started: number, deps: MediaDeps): Promise<ImageOldFile> {
  if (old.id === target.id || old.url === target.url) return "kept";
  if (deps.now() - started > REMOVE_CUTOFF_MS) return "kept";
  const all = await deps.readAll(input.tenantId).catch(() => null);
  if (!all?.ok) return "kept";
  const own = all.rows.filter((row) => row.key === input.key);
  if (own.length !== 1 || own[0].value.trim() !== target.url) return "kept";
  if (all.rows.some((row) => row.key !== input.key && row.value.includes(old.url))) return "in_use";
  if (!(await isProvenNew(input, target, deps))) return "unproven";
  const outcome = await trashVerified(input, old, started, deps);
  if (outcome === "trashed") return "trashed";
  return outcome === "unconfirmed" ? "unconfirmed" : "kept";
}

// The upload answer holds only an id and URL. The listing must show the name and folder we asked
// for, and the stored bytes must be the ones sent, or the old file is the only good copy.
async function isProvenNew(input: Input, target: MediaFile, deps: MediaDeps): Promise<boolean> {
  if (!(await deps.verify(input.tenantId, target).catch(() => false))) return false;
  const bytes = await deps.fetchBytes(target.url, MAX_IMAGE_BYTES).catch(() => null);
  return !!bytes && sha256(bytes) === input.file.hash;
}

// The value did not move: only the file this request uploaded may go, and only if nothing points at it.
async function removeUploaded(input: Input, file: MediaFile, started: number, deps: MediaDeps): Promise<boolean> {
  if (deps.now() - started > REMOVE_CUTOFF_MS) return false;
  const all = await deps.readAll(input.tenantId).catch(() => null);
  if (!all?.ok || all.rows.some((row) => row.value.includes(file.url))) return false;
  return (await trashVerified(input, file, started, deps)) === "trashed";
}

async function failAfterUpload(input: Input, run: Run, target: Target, started: number, deps: MediaDeps): Promise<Run> {
  if (!target.uploadedNow || run.keepLease) return run;
  const removed = await removeUploaded(input, target.file, started, deps);
  return removed ? run : { ...run, answer: { ...run.answer, leftover: true } };
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

  const located = await findOld(input, current, deps);
  if ("stop" in located) return stopped(located.stop);
  const { old, siblings } = located;
  const wanted = formatOfFile(old);
  const sending = FORMAT_OF_TYPE[input.file.contentType];
  if (wanted && wanted !== sending) {
    return { answer: wanted === "other" ? { status: "format_mismatch" } : { status: "format_mismatch", format: wanted }, keepLease: false };
  }

  const match = await matchSibling(input, siblings, deps);
  if (match && "stop" in match) return stopped(match.stop);
  let target: Target;
  if (match) target = { file: match, uploadedNow: false };
  else {
    if (await isCurrentImage(input, old, deps)) return { answer: { status: "saved", url: old.url, oldFile: "same" }, keepLease: false };
    if (deps.now() - started > UPLOAD_CUTOFF_MS) return stopped("retry");
    const uploaded = await uploadNew(input, old, siblings, deps);
    if (!("file" in uploaded)) return uploaded;
    target = uploaded;
  }
  // HighLevel answering with the old file would make the last step remove the live image.
  if (target.file.id === old.id || target.file.url === old.url) return stopped("unknown");
  // Never widened automatically: a host not on the list stops here, before the value changes.
  if (!isAllowedLogoUrl(target.file.url, deps.hosts)) return failAfterUpload(input, stopped("bad_host"), target, started, deps);
  if (deps.now() - started > PUT_CUTOFF_MS) return failAfterUpload(input, stopped("retry"), target, started, deps);
  const saved = await pointValueAt(input, target.file.url, started, deps);
  if (saved.answer.status !== "saved") return failAfterUpload(input, saved, target, started, deps);
  const oldFile = await removeOld(input, old, target.file, started, deps);
  return { answer: { ...saved.answer, oldFile }, keepLease: false };
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
