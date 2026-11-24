import type { MediaFolder, MediaFolderOutcome, MediaLibrary, MediaUpload, MediaUploadOutcome } from "@/features/highlevel";
import type { ImageCopyOutcome } from "../types";
import type { Compressed } from "./compress";

// Copies one template image into the target's own media library, so the client never links to a file
// the template owns. Order: (a) a file with the same name in the same folder path already in the
// target is reused; (b) else the template file is downloaded, made WebP (SVG stays SVG after the
// safety check), put in the same folder path (created when missing) and uploaded. A 403 on the
// target's library means the app lacks the media scopes: the value is left blank and reported.
// UNVERIFIED CONTRACTS (no real response seen): that a media list row's `name` is the `name` sent with
// the upload, that `parentId` is honored on upload, and POST /medias/folder's answer (see media-write.ts).
export type ImageCopyDeps = {
  templateLibrary: () => Promise<MediaLibrary>;
  targetLibrary: () => Promise<MediaLibrary>;
  createFolder: (name: string, parentId: string | null) => Promise<MediaFolderOutcome>;
  upload: (file: MediaUpload) => Promise<MediaUploadOutcome>;
  // https, allowed hosts, no redirect, timeout and size cap (fetchMediaBytes). Null on any failure.
  fetchBytes: (url: string) => Promise<Uint8Array | null>;
  compress: (bytes: Uint8Array) => Promise<Compressed | null>;
  checkSvg: (bytes: Uint8Array) => { ok: true; bytes: Uint8Array } | { ok: false };
  isAllowedHost: (url: string) => boolean;
};

const MAX_DEPTH = 20;
// Non-image media copied as they are, by file extension. Still capped by fetchMediaBytes (20 MB).
// UNVERIFIED CONTRACT: that POST /medias/upload-file accepts these types from this app.
const PASS_THROUGH: Record<string, string> = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", pdf: "application/pdf" };

function lastSegment(url: string): string {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    return name.replace(/[^\w.\- ]/g, "_").slice(0, 120) || "image";
  } catch {
    return "image";
  }
}

const isSvgName = (name: string) => /\.svg$/i.test(name);
const webpName = (name: string) => `${name.replace(/\.(png|jpe?g|webp|gif|avif|tiff?|heic|heif)$/i, "")}.webp`;

function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.subarray(0, 512)).trimStart().toLowerCase();
  return head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"));
}

// Folder names from the top of the library down to `parentId`. Null when the chain cannot be read.
export function folderPath(folders: readonly MediaFolder[], parentId: string | null): string[] | null {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const names: string[] = [];
  let at = parentId;
  for (let depth = 0; at !== null; depth += 1) {
    const folder = byId.get(at);
    if (!folder || depth > MAX_DEPTH) return null;
    names.unshift(folder.name);
    at = folder.parentId;
  }
  return names;
}

const findFolder = (folders: readonly MediaFolder[], name: string, parentId: string | null) =>
  folders.find((f) => f.name === name && f.parentId === parentId) ?? null;

export function createImageCopier(deps: ImageCopyDeps) {
  let templateLib: Promise<MediaLibrary> | null = null;
  let targetLib: Promise<MediaLibrary> | null = null;
  const template = () => (templateLib ??= deps.templateLibrary());
  const target = () => (targetLib ??= deps.targetLibrary());

  // The folder chain in the target, created where missing. Undefined: it could not be made.
  async function ensureFolders(lib: Extract<MediaLibrary, { ok: true }>, path: readonly string[]): Promise<string | null | "permission" | undefined> {
    let parent: string | null = null;
    for (const name of path) {
      const found = findFolder(lib.folders, name, parent);
      if (found) {
        parent = found.id;
        continue;
      }
      const made = await deps.createFolder(name, parent);
      if (made.kind === "permission") return "permission";
      if (made.kind !== "created") return undefined;
      lib.folders.push({ id: made.id, name, parentId: parent });
      parent = made.id;
    }
    return parent;
  }

  return async function copyImage(url: string): Promise<ImageCopyOutcome> {
    if (!deps.isAllowedHost(url)) return { kind: "image_host_not_allowed" };
    const tpl = await template();
    // Without the template's whole library the file's folder path and name are unknown: copying it
    // anyway would put it at the top under a made-up name, so nothing is uploaded and it is reported.
    if (!tpl.ok) return { kind: tpl.reason === "permission" ? "needs_media_permission" : "image_failed" };
    const source = tpl.files.find((f) => f.url === url);
    // A file that is not in the template's library (another allowed host) goes to the top.
    const name = source?.name ?? lastSegment(url);
    // A template file whose folder chain cannot be read goes to the top of the target library.
    const path = (source ? folderPath(tpl.folders, source.parentId) : null) ?? [];
    const lib = await target();
    if (!lib.ok) return { kind: lib.reason === "permission" ? "needs_media_permission" : "image_failed" };

    // (a) Same name in the same folder path: use the target's own file.
    let parent: string | null = null;
    let pathExists = true;
    for (const folderName of path) {
      const found = findFolder(lib.folders, folderName, parent);
      if (!found) {
        pathExists = false;
        break;
      }
      parent = found.id;
    }
    if (pathExists) {
      const names = new Set([name, webpName(name), `${name.replace(/\.[a-z0-9]{2,5}$/i, "")}.svg`]);
      const existing = lib.files.find((f) => f.parentId === parent && names.has(f.name));
      if (existing) return { kind: "reused", url: existing.url };
    }

    // (b) Download, compress, upload.
    const bytes = await deps.fetchBytes(url);
    if (!bytes) return { kind: "image_failed" };
    let upload: Omit<MediaUpload, "parentId">;
    if (isSvgName(name) || looksLikeSvg(bytes)) {
      const checked = deps.checkSvg(bytes);
      if (!checked.ok) return { kind: "image_failed" };
      const fileName = isSvgName(name) ? name : `${name.replace(/\.[a-z0-9]{2,5}$/i, "")}.svg`;
      upload = { bytes: checked.bytes, name: fileName, fileName, contentType: "image/svg+xml" };
    } else {
      const small = await deps.compress(bytes);
      const passType = PASS_THROUGH[(/\.([a-z0-9]{2,5})$/i.exec(name)?.[1] ?? "").toLowerCase()];
      if (small) {
        const fileName = webpName(name);
        upload = { bytes: small.bytes, name: fileName, fileName, contentType: "image/webp" };
      } else if (passType) {
        // A video or PDF on a media host (for example the background "video or image" key): copied
        // byte for byte into the client's library, never linked to the template's file.
        upload = { bytes, name, fileName: name, contentType: passType };
      } else {
        return { kind: "not_an_image" };
      }
    }
    const folderId = await ensureFolders(lib, path);
    if (folderId === "permission") return { kind: "needs_media_permission" };
    if (folderId === undefined) return { kind: "image_failed" };
    const sent = await deps.upload({ ...upload, parentId: folderId });
    if (sent.kind === "uploaded") {
      lib.files.push({ id: sent.fileId, name: upload.name, url: sent.url, parentId: folderId });
      return { kind: "uploaded", url: sent.url };
    }
    return { kind: sent.kind === "permission" ? "needs_media_permission" : "image_failed" };
  };
}
