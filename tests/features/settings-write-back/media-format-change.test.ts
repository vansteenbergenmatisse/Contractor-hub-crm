import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomValueDetail, MediaFile, MediaFind, MediaLibrary, MediaUploadOutcome } from "@/features/highlevel";
import { handleMediaReplace, replaceImage, type MediaDeps, type MediaRouteDeps } from "@/features/settings-write-back";
import { lossy } from "./webp-fixtures";

// Any allowed image type replaces any other. A new format is a new file in the old file's folder,
// named after it with the new extension. Mocked HighLevel and database only. All values are fake.
const KEY = "business_logo";
const FOLDER = "brand-folder";
const OLD = "https://assets.cdn.filesafe.space/x/logo.svg";
const NEW = "https://files.leadconnectorhq.com/x/new";
const OTHER = "https://files.leadconnectorhq.com/x/other";
const BYTES = new Uint8Array([1, 2, 3, 4]);
const OLD_BYTES = new Uint8Array([5, 6, 7, 8]);
const HASH = createHash("sha256").update(BYTES).digest("hex");
const OLD_FILE: MediaFile = { id: "old-id", name: "logo.svg", url: OLD, parentId: FOLDER };
const WEBP = { bytes: BYTES, contentType: "image/webp", extension: "webp", hash: HASH };
const PNG = { ...WEBP, contentType: "image/png", extension: "png" };
const JPEG = { ...WEBP, contentType: "image/jpeg", extension: "jpg" };
const SVG = { ...WEBP, contentType: "image/svg+xml", extension: "svg" };
const row = (key: string, value: string): CustomValueDetail => ({ id: `id-${key}`, key, name: `Name ${key}`, value });

type Options = {
  old?: MediaFile;
  value?: string;
  found?: MediaFind;
  files?: MediaFile[];
  libraries?: MediaLibrary[];
  uploaded?: MediaUploadOutcome;
  putFails?: "rejected";
  bytes?: Record<string, Uint8Array>;
};

function deps(options: Options = {}) {
  const old = options.old ?? OLD_FILE;
  const store = new Map([[KEY, row(KEY, options.value ?? old.url)]]);
  const first: MediaLibrary = { ok: true, files: [old, ...(options.files ?? [])], folders: [{ id: FOLDER, name: "01_Brand", parentId: null }] };
  const libraries = [...(options.libraries ?? [first])];
  const calls: string[] = [];
  let audits = 0;
  const d = {
    store,
    calls,
    read: vi.fn<MediaDeps["read"]>(async () => ({ ok: true, values: [...store.values()].map((item) => ({ ...item })) })),
    update: vi.fn<MediaDeps["update"]>(async (_tenant, target, value) => {
      calls.push("put");
      if (options.putFails) return options.putFails;
      (store.get(target.key) as CustomValueDetail).value = value;
      return "saved";
    }),
    begin: vi.fn<MediaDeps["begin"]>(async () => {
      calls.push("audit");
      return `audit-${(audits += 1)}`;
    }),
    finish: vi.fn<MediaDeps["finish"]>(async () => {}),
    invalidate: vi.fn<MediaDeps["invalidate"]>(),
    claim: vi.fn<MediaDeps["claim"]>(async () => "holder"),
    release: vi.fn<MediaDeps["release"]>(async () => {}),
    now: vi.fn<MediaDeps["now"]>(() => 0),
    find: vi.fn<MediaDeps["find"]>(async () => {
      calls.push("find");
      return options.found ?? { ok: true, files: [old], siblings: [] };
    }),
    verify: vi.fn<MediaDeps["verify"]>(async () => true),
    trash: vi.fn<MediaDeps["trash"]>(async () => {
      calls.push("trash");
      return "trashed";
    }),
    upload: vi.fn<MediaDeps["upload"]>(async () => {
      calls.push("upload");
      return options.uploaded ?? { kind: "uploaded", fileId: "f1", url: NEW };
    }),
    fetchBytes: vi.fn<MediaDeps["fetchBytes"]>(async (url) => options.bytes?.[url] ?? (url === old.url ? OLD_BYTES : BYTES)),
    readAll: vi.fn<MediaDeps["readAll"]>(async () => ({ ok: true, rows: [...store.values()].map(({ key, value }) => ({ key, value })) })),
    hosts: ["assets.cdn.filesafe.space", "files.leadconnectorhq.com"],
    library: vi.fn<NonNullable<MediaDeps["library"]>>(async () => {
      calls.push("library");
      return libraries.length > 1 ? (libraries.shift() as MediaLibrary) : libraries[0];
    }),
    createFolder: vi.fn<NonNullable<MediaDeps["createFolder"]>>(async () => ({ kind: "created", id: "made" })),
    folderOf: vi.fn<NonNullable<MediaDeps["folderOf"]>>(() => "01_Brand"),
  };
  return d;
}
type File = typeof WEBP;
const run = (d: MediaDeps, file: File = WEBP, over: Partial<{ tenantId: string; expected: string }> = {}) =>
  replaceImage({ tenantId: "T1", actorId: "U1", key: KEY, expected: (d as ReturnType<typeof deps>).store.get(KEY)!.value, file, ...over }, d);
const uploadedAs = (d: ReturnType<typeof deps>) => d.upload.mock.calls[0][1];

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("replaceImage: a new format becomes a new file in the old file's folder", () => {
  it("the old format_mismatch case (logo.svg + WebP) now saves as logo.webp in the same folder", async () => {
    const d = deps();
    expect(await run(d)).toEqual({ status: "saved", url: NEW, oldFile: "trashed" });
    expect(uploadedAs(d)).toMatchObject({ name: "logo.webp", fileName: "logo.webp", parentId: FOLDER, contentType: "image/webp" });
    expect(d.store.get(KEY)?.value).toBe(NEW);
    expect(d.calls).toEqual(["find", "library", "audit", "upload", "audit", "put", "audit", "trash"]);
  });

  it.each([["PNG", PNG, "logo.png"], ["JPEG", JPEG, "logo.jpg"]] as const)("SVG to photo: a %s over an SVG gets the photo's extension", async (_name, file, name) => {
    const d = deps();
    expect((await run(d, file)).status).toBe("saved");
    expect(uploadedAs(d)).toMatchObject({ name, parentId: FOLDER, contentType: file.contentType });
  });

  it("photo to SVG: an SVG over logo.webp is uploaded as logo.svg", async () => {
    const d = deps({ old: { id: "old-id", name: "logo.webp", url: "https://assets.cdn.filesafe.space/x/logo.webp", parentId: FOLDER } });
    expect(await run(d, SVG)).toEqual({ status: "saved", url: NEW, oldFile: "trashed" });
    expect(uploadedAs(d)).toMatchObject({ name: "logo.svg", parentId: FOLDER, contentType: "image/svg+xml" });
  });

  it("SVG to SVG keeps the same-name replace and never reads the library", async () => {
    const d = deps();
    expect((await run(d, SVG)).status).toBe("saved");
    expect(uploadedAs(d)).toMatchObject({ name: "logo.svg", parentId: FOLDER });
    expect(d.library).not.toHaveBeenCalled();
  });

  it.each([["WebP", "logo.webp", WEBP], ["PNG", "logo.png", PNG]] as const)("photo to photo (%s to the same) keeps the same-name replace", async (_name, name, file) => {
    const d = deps({ old: { id: "old-id", name, url: `https://assets.cdn.filesafe.space/x/${name}`, parentId: FOLDER } });
    expect((await run(d, file)).status).toBe("saved");
    expect(uploadedAs(d)).toMatchObject({ name, parentId: FOLDER });
    expect(d.library).not.toHaveBeenCalled();
  });

  it.each([["an SVG", SVG, "svg"], ["a WebP", WEBP, "webp"]] as const)("empty to any: %s is added into the layout folder", async (_name, file, ext) => {
    const d = deps({ value: "" });
    expect(await run(d, file)).toEqual({ status: "saved", url: NEW, oldFile: "none" });
    expect(uploadedAs(d)).toMatchObject({ name: `${KEY}.${ext}`, parentId: FOLDER });
    expect(d.trash).not.toHaveBeenCalled();
  });

  it("outside link to any: a photo over a link that is no library file is added, and nothing is trashed", async () => {
    const d = deps({ value: "https://assets.cdn.filesafe.space/x/elsewhere.svg", found: { ok: true, files: [], siblings: [] } });
    expect(await run(d)).toEqual({ status: "saved", url: NEW, oldFile: "outside" });
    expect(uploadedAs(d)).toMatchObject({ name: `${KEY}.webp` });
    expect(d.trash).not.toHaveBeenCalled();
  });

  it("names a file with no extension after the whole name", async () => {
    const d = deps({ old: { id: "old-id", name: "Brand mark", url: OLD, parentId: null } });
    expect((await run(d)).status).toBe("saved");
    expect(uploadedAs(d)).toMatchObject({ name: "Brand mark.webp", parentId: null });
  });
});

describe("replaceImage: the old file after a format change", () => {
  it("keeps the old file when another custom value uses its URL", async () => {
    const d = deps();
    d.store.set("business_favicon_url", row("business_favicon_url", OLD));
    expect(await run(d)).toEqual({ status: "saved", url: NEW, oldFile: "in_use" });
    expect(d.trash).not.toHaveBeenCalled();
  });

  it("trashes the old file, audited and by id, when nothing else uses it", async () => {
    const d = deps();
    expect((await run(d)).oldFile).toBe("trashed");
    expect(d.verify).toHaveBeenCalledWith("T1", OLD_FILE);
    expect(d.verify).toHaveBeenCalledWith("T1", { id: "f1", name: "logo.webp", url: NEW, parentId: FOLDER });
    expect(d.trash).toHaveBeenCalledExactlyOnceWith("T1", "old-id");
    expect(d.begin.mock.calls.map(([audit]) => audit.newValue)).toEqual([`upload:${KEY}-${HASH.slice(0, 12)}`, NEW, "trash:old-id"]);
  });

  it("a failed save removes only the new upload and leaves the old file and value alone", async () => {
    const d = deps({ putFails: "rejected" });
    expect(await run(d)).toEqual({ status: "rejected" });
    expect(d.trash).toHaveBeenCalledExactlyOnceWith("T1", "f1");
    expect(d.store.get(KEY)?.value).toBe(OLD);
  });
});

describe("replaceImage: format change retries and name clashes", () => {
  it("no upload answer: reads the library again, never uploads twice, and keeps the lease", async () => {
    const d = deps({ uploaded: { kind: "no_answer" } });
    expect(await run(d)).toEqual({ status: "unknown" });
    expect(d.upload).toHaveBeenCalledTimes(1);
    expect(d.library).toHaveBeenCalledTimes(2);
    expect(d.update).not.toHaveBeenCalled();
    expect(d.trash).not.toHaveBeenCalled();
    expect(d.release).not.toHaveBeenCalled();
  });

  it("a retry reuses an identical logo.webp already in the folder, with no second upload", async () => {
    const d = deps({ files: [{ id: "earlier", name: "logo.webp", url: OTHER, parentId: FOLDER }] });
    expect(await run(d)).toEqual({ status: "saved", url: OTHER, oldFile: "trashed" });
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("a different file already named logo.webp is left alone and the upload takes a unique name", async () => {
    const d = deps({ files: [{ id: "unrelated", name: "logo.webp", url: OTHER, parentId: FOLDER }], bytes: { [OTHER]: new Uint8Array([9]) } });
    expect((await run(d)).status).toBe("saved");
    expect(uploadedAs(d)).toMatchObject({ name: "logo-2.webp", parentId: FOLDER });
    expect(d.trash).toHaveBeenCalledExactlyOnceWith("T1", "old-id");
  });

  it("a same-name file in another folder is no clash", async () => {
    const d = deps({ files: [{ id: "elsewhere", name: "logo.webp", url: OTHER, parentId: "other-folder" }] });
    expect((await run(d)).status).toBe("saved");
    expect(uploadedAs(d)).toMatchObject({ name: "logo.webp", parentId: FOLDER });
  });

  it("without the library reader the format change still stops as before", async () => {
    const d: Partial<ReturnType<typeof deps>> = deps();
    delete d.library;
    delete d.createFolder;
    delete d.folderOf;
    expect(await run(d as MediaDeps)).toEqual({ status: "format_mismatch", format: "svg" });
    expect(d.upload).not.toHaveBeenCalled();
  });
});

describe("replaceImage: a format change stays inside the signed-in tenant", () => {
  it("uses only the given tenant for every HighLevel and audit call", async () => {
    const d = deps();
    await run(d, WEBP, { tenantId: "T2" });
    for (const mock of [d.claim, d.read, d.find, d.library, d.upload, d.update, d.verify, d.trash, d.readAll, d.release]) {
      expect(mock).toHaveBeenCalled();
      for (const call of mock.mock.calls as unknown[][]) expect(call[0]).toBe("T2");
    }
    expect(d.begin.mock.calls.every(([audit]) => audit.tenantId === "T2")).toBe(true);
  });
});

describe("POST /api/settings/media: a logo photo over an SVG", () => {
  it("reaches the replace and saves the photo as a new file next to the SVG", async () => {
    const ORIGIN = "https://app.example.test";
    const media = deps();
    let sent: Uint8Array | null = null;
    media.upload.mockImplementation(async (_tenant, file) => {
      sent = file.bytes;
      return { kind: "uploaded", fileId: "f1", url: NEW };
    });
    media.fetchBytes.mockImplementation(async (url) => (url === NEW ? sent : OLD_BYTES));
    const route: MediaRouteDeps = {
      appOrigin: ORIGIN,
      currentUser: async () => ({ id: "U1", role: "owner", tenantId: "T1" }),
      isEnabled: () => true,
      hit: async () => true,
      logoAcceptsPhoto: true,
      replace: (input) => replaceImage(input, media),
    };
    const body = new FormData();
    body.append("key", KEY);
    body.append("expected", OLD);
    body.append("file", new Blob([lossy(100, 100) as BlobPart], { type: "image/webp" }));
    const response = await handleMediaReplace(new Request(`${ORIGIN}/api/settings/media`, { method: "POST", headers: { origin: ORIGIN }, body }), route);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "saved", url: NEW, oldFile: "trashed" });
    expect(uploadedAs(media)).toMatchObject({ name: "logo.webp", parentId: FOLDER, contentType: "image/webp" });
  });
});
