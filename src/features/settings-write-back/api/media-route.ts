import { createHash } from "node:crypto";
import { imageKindOf, isSettingsKeyAllowed, LOGO_ACCEPTS_PHOTO, MAX_VALUE_LENGTH, UNLOCK_ID, writeGuardOf, type ImageAnswer } from "@/features/settings";
import type { CheckedImage } from "./media-replace";
import { checkJpeg, checkPng, isJpeg, isPng } from "./raster-check";
import { inspectSvg, type SvgProblem } from "./svg-check";
import { checkWebp, MAX_IMAGE_BYTES } from "./webp-check";

// Room for the multipart wrapping around the largest allowed image.
const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 64 * 1024;
const HOUR_MS = 60 * 60 * 1000;
// Proposals, not measured numbers.
export const IMAGES_PER_HOUR_PER_USER = 20;
export const IMAGES_PER_HOUR_PER_TENANT = 40;

type MediaUser = { id: string; role: "owner" | "office" | "admin"; tenantId: string | null; viewing?: boolean };
export type MediaRouteDeps = {
  appOrigin: string;
  currentUser: (request: Request) => Promise<MediaUser | null>;
  isEnabled: (tenantId: string) => boolean;
  hit: (key: string, limit: number, windowMs: number, now: Date) => Promise<boolean>;
  replace: (input: { tenantId: string; actorId: string; key: string; expected: string; file: CheckedImage; unlocked?: string }) => Promise<ImageAnswer>;
  // The logo and favicon also take a photo. Left out: LOGO_ACCEPTS_PHOTO, the value the page reads.
  logoAcceptsPhoto?: boolean;
  // Forge Forward locked this key for the tenant. A failed check uploads nothing (fails closed).
  isLocked?: (tenantId: string, key: string) => Promise<boolean>;
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "cache-control": "no-store", "content-type": "application/json" } });

export const mediaFailure = () => reply(500, { error: "failed" });

// Stops reading at the limit, so an oversized body is never fully buffered.
async function readCapped(request: Request): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) return new Uint8Array();
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    await request.body.cancel().catch(() => {});
    return null;
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

type Fields = { key: string; expected: string; file: Blob; unlocked?: string };

// The same guard as a save (writeGuardOf): a protected folder's key needs that folder's unlock, and a
// read-only key is never written.
function guardAllows(key: string, unlocked: string | undefined): boolean {
  const guard = writeGuardOf(key);
  if (guard.kind === "open") return true;
  return guard.kind === "folder" && guard.folder === unlocked;
}

// Strict: exactly these three fields, once each, plus an optional `unlock` (a protected folder's id).
// Any other field, a tenant id included, refuses it.
async function parseFields(bytes: Uint8Array<ArrayBuffer>, contentType: string): Promise<Fields | null> {
  let form: FormData;
  try {
    form = await new Response(bytes, { headers: { "content-type": contentType } }).formData();
  } catch {
    return null;
  }
  const names = [...form.keys()].sort().join(",");
  if (names !== "expected,file,key" && names !== "expected,file,key,unlock") return null;
  const key = form.get("key");
  const expected = form.get("expected");
  const file = form.get("file");
  const unlock = form.get("unlock");
  if (typeof key !== "string" || typeof expected !== "string" || !(file instanceof Blob)) return null;
  if (unlock !== null && (typeof unlock !== "string" || !UNLOCK_ID.test(unlock))) return null;
  const unlocked = unlock ?? undefined;
  if (expected.length > MAX_VALUE_LENGTH || !isSettingsKeyAllowed(key) || !imageKindOf(key) || !guardAllows(key, unlocked)) return null;
  return unlocked ? { key, expected, file, unlocked } : { key, expected, file };
}

type Checked = { ok: true; file: CheckedImage } | { ok: false; reason: string; problem?: SvgProblem };

const isWebpHeader = (bytes: Uint8Array) =>
  bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";

// The file's real bytes decide. The browser's name and type are never read. The logo and favicon take
// an SVG; with `logoPhoto` a PNG, JPEG or WebP too, checked like any photo.
function checkFile(key: string, bytes: Uint8Array, logoPhoto: boolean): Checked {
  let out: Uint8Array;
  let contentType: string;
  let extension: string;
  const raster = isPng(bytes) || isJpeg(bytes) || isWebpHeader(bytes);
  if (imageKindOf(key) === "svg" && !(logoPhoto && raster)) {
    const svg = inspectSvg(bytes);
    if (!svg.ok) return { ok: false, reason: svg.reason, problem: svg.problem };
    out = svg.bytes;
    contentType = "image/svg+xml";
    extension = "svg";
  } else {
    const [check, type, ext] = isPng(bytes) ? [checkPng, "image/png", "png"] : isJpeg(bytes) ? [checkJpeg, "image/jpeg", "jpg"] : [checkWebp, "image/webp", "webp"];
    const raster = check(bytes);
    if (!raster.ok) return { ok: false, reason: raster.reason };
    out = bytes;
    contentType = type;
    extension = ext;
  }
  return { ok: true, file: { bytes: out, contentType, extension, hash: createHash("sha256").update(out).digest("hex") } };
}

// User and tenant come from the session only. Owners of a tenant only: an admin, also during View as
// client, is refused. With the flag off nothing further runs and the route answers as if absent.
export async function handleMediaReplace(request: Request, deps: MediaRouteDeps): Promise<Response> {
  if (request.headers.get("origin") !== deps.appOrigin) return reply(403, { error: "forbidden" });
  const user = await deps.currentUser(request);
  if (!user) return reply(401, { error: "unauthorized" });
  if (user.role !== "owner" || !user.tenantId || user.viewing) return reply(403, { error: "forbidden" });
  const tenantId = user.tenantId;
  if (!deps.isEnabled(tenantId)) return reply(404, { error: "not_found" });
  let allowed = false;
  try {
    const now = new Date();
    allowed = await deps.hit(`settings-media-user:${user.id}`, IMAGES_PER_HOUR_PER_USER, HOUR_MS, now)
      && await deps.hit(`settings-media-tenant:${tenantId}`, IMAGES_PER_HOUR_PER_TENANT, HOUR_MS, now);
  } catch {
    console.error("Settings image failed: step=limiter");
  }
  if (!allowed) return reply(429, { error: "too_many" });
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) return reply(400, { error: "invalid" });
  const body = await readCapped(request);
  if (!body) return reply(413, { error: "too_large" });
  const fields = await parseFields(body, contentType);
  if (!fields) return reply(400, { error: "invalid" });
  if (deps.isLocked) {
    let locked: boolean;
    try {
      locked = await deps.isLocked(tenantId, fields.key);
    } catch {
      console.error("Settings image failed: step=locks");
      return reply(200, { status: "retry" });
    }
    if (locked) return reply(200, { status: "locked" });
  }
  const checked = checkFile(fields.key, new Uint8Array(await fields.file.arrayBuffer()), deps.logoAcceptsPhoto ?? LOGO_ACCEPTS_PHOTO);
  if (!checked.ok) {
    const response = reply(400, { error: "invalid", reason: checked.reason });
    // One fixed code from the checker, never text from the file.
    if (checked.problem) response.headers.set("x-svg-problem", checked.problem);
    return response;
  }
  try {
    const unlocked = fields.unlocked ? { unlocked: fields.unlocked } : {};
    return reply(200, await deps.replace({ tenantId, actorId: user.id, key: fields.key, expected: fields.expected, file: checked.file, ...unlocked }));
  } catch {
    console.error("Settings image failed: step=replace");
    return mediaFailure();
  }
}
