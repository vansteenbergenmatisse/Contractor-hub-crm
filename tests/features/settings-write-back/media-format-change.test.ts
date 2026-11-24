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
// Any other file in the library holds other bytes unless a test says otherwise.
const ELSE_BYTES = new Uint8Array([9, 9]);
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
  bytes?: Record<string, Uint8Array | null>;
  // The adapter's find hands back the whole walk (production wiring). False: it does not.
  findLists?: boolean;
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
      if (options.found) return options.found;
      return options.findLists === false ? { ok: true, files: [old], siblings: [] } : { ok: true, files: [old], siblings: [], library: first.files };
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
    fetchBytes: vi.fn<MediaDeps["fetchBytes"]>(async (url) => {
      if (options.bytes && url in options.bytes) return options.bytes[url];
      return url === old.url ? OLD_BYTES : url === NEW ? BYTES : ELSE_BYTES;
    }),
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
    expect(d.calls).toEqual(["find", "audit", "upload", "audit", "put", "audit", "trash"]);
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
    expect(d.begin.mock.calls.map(([audit]) => audit.newValue)).toEqual([`upload:${KEY}-${HASH.slice(0, 12)} name=logo.webp folder=${FOLDER}`, NEW, "trash:old-id"]);
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
    // The first walk came with the find; only the check after no answer reads the library.
    expect(d.library).toHaveBeenCalledTimes(1);
    expect(d.update).not.toHaveBeenCalled();
    expect(d.trash).not.toHaveBeenCalled();
    expect(d.release).not.toHaveBeenCalled();
  });

  it("a retry reuses an identical logo.webp already in the folder, with no second upload", async () => {
    const d = deps({ files: [{ id: "earlier", name: "logo.webp", url: OTHER, parentId: FOLDER }], bytes: { [OTHER]: BYTES } });
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
    for (const mock of [d.claim, d.read, d.find, d.upload, d.update, d.verify, d.trash, d.readAll, d.release]) {
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

// Review fixes (2026-11-24): one library walk, names HighLevel may change, safe derived names,
// unreadable siblings, the upload audit row, and the stops not covered above.
const ORIGIN = "https://app.example.test";
function routeTo(media: ReturnType<typeof deps>, overrides: Partial<MediaRouteDeps> = {}) {
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
    ...overrides,
  };
  return (key: string, expected: string, file: Blob) => {
    const body = new FormData();
    body.append("key", key);
    body.append("expected", expected);
    body.append("file", file);
    return handleMediaReplace(new Request(`${ORIGIN}/api/settings/media`, { method: "POST", headers: { origin: ORIGIN }, body }), route);
  };
}
const folderFile = (id: string, name: string, url: string): MediaFile => ({ id, name, url, parentId: FOLDER });
const libraryWith = (...files: MediaFile[]): MediaLibrary => ({ ok: true, files: [OLD_FILE, ...files], folders: [] });

describe("replaceImage: a format change walks the library once", () => {
  it("uses the file list that came with the find: one walk in all", async () => {
    const d = deps();
    expect((await run(d)).status).toBe("saved");
    expect(d.find.mock.calls.length + d.library.mock.calls.length).toBe(1);
  });

  it("reads the library itself only when the find brought no list", async () => {
    const d = deps({ findLists: false });
    expect((await run(d)).status).toBe("saved");
    expect(d.find).toHaveBeenCalledTimes(1);
    expect(d.library).toHaveBeenCalledTimes(1);
  });

  it.each([["permission", "needs_approval"], ["connection", "connection"], ["retry", "retry"], ["incomplete", "library_limit"]] as const)(
    "a library that cannot be read (%s) stops with %s before any upload",
    async (reason, status) => {
      const d = deps({ findLists: false, libraries: [{ ok: false, reason }] });
      expect(await run(d)).toEqual({ status });
      expect(d.upload).not.toHaveBeenCalled();
      expect(d.update).not.toHaveBeenCalled();
    },
  );
});

describe("replaceImage: a format change finds its upload by id and URL, not only by name", () => {
  it("HighLevel stores the upload as 'logo (1).webp': the real name is read by id, proven, and the old file trashed", async () => {
    const stored = folderFile("f1", "logo (1).webp", NEW);
    const d = deps({ libraries: [libraryWith(stored)] });
    d.verify.mockImplementation(async (_tenant, file) => file.id !== "f1" || file.name === stored.name);
    expect(await run(d)).toEqual({ status: "saved", url: NEW, oldFile: "trashed" });
    expect(d.verify).toHaveBeenCalledWith("T1", stored);
    expect(d.trash).toHaveBeenCalledExactlyOnceWith("T1", "old-id");
  });

  it("a renamed upload whose id is not listed is unproven: the old file stays", async () => {
    const d = deps({ libraries: [libraryWith(folderFile("someone", "logo (1).webp", NEW))] });
    d.verify.mockImplementation(async (_tenant, file) => file.id !== "f1");
    expect(await run(d)).toEqual({ status: "saved", url: NEW, oldFile: "unproven" });
    expect(d.trash).not.toHaveBeenCalled();
  });

  it("a retry reuses the renamed upload 'logo (1).webp' with the same bytes: no duplicate", async () => {
    const d = deps({ files: [folderFile("f1", "logo (1).webp", OTHER)], bytes: { [OTHER]: BYTES } });
    expect(await run(d)).toEqual({ status: "saved", url: OTHER, oldFile: "trashed" });
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("a retry reuses an upload stored with another case ('Logo.WEBP')", async () => {
    const d = deps({ files: [folderFile("f1", "Logo.WEBP", OTHER)], bytes: { [OTHER]: BYTES } });
    expect((await run(d)).status).toBe("saved");
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("no answer, then a new 'logo (1).webp' with the same bytes in the folder counts as the upload", async () => {
    const landed = folderFile("f9", "logo (1).webp", OTHER);
    const d = deps({ uploaded: { kind: "no_answer" }, libraries: [libraryWith(landed)], bytes: { [OTHER]: BYTES } });
    expect(await run(d)).toEqual({ status: "saved", url: OTHER, oldFile: "trashed" });
    expect(d.upload).toHaveBeenCalledTimes(1);
  });

  it("no answer, then a near-named new file with other bytes or in another folder is not the upload", async () => {
    const d = deps({
      uploaded: { kind: "no_answer" },
      libraries: [libraryWith(folderFile("f9", "logo (1).webp", OTHER), { id: "f8", name: "logo.webp", url: NEW, parentId: "other-folder" })],
    });
    expect(await run(d)).toEqual({ status: "unknown" });
    expect(d.update).not.toHaveBeenCalled();
    expect(d.release).not.toHaveBeenCalled();
  });

  it("no answer, and a new file with the same bytes but a different name is not the upload", async () => {
    const d = deps({ uploaded: { kind: "no_answer" }, libraries: [libraryWith(folderFile("f9", "banner.webp", OTHER))], bytes: { [OTHER]: BYTES } });
    expect(await run(d)).toEqual({ status: "unknown" });
    expect(d.update).not.toHaveBeenCalled();
  });
});

describe("replaceImage: the derived file name is safe", () => {
  it.each([
    ["an empty base ('.svg') becomes the key", ".svg", `${KEY}.webp`],
    ["control characters and slashes are dropped", "lo\u0000go/x\\y\u001f.svg", "logoxy.webp"],
    ["only spaces becomes the key", "   .svg", `${KEY}.webp`],
  ])("%s", async (_name, name, expected) => {
    const d = deps({ old: { ...OLD_FILE, name } });
    expect((await run(d)).status).toBe("saved");
    expect(uploadedAs(d)).toMatchObject({ name: expected, fileName: expected });
  });

  it("a long name is cut to 120 characters, extension included", async () => {
    const d = deps({ old: { ...OLD_FILE, name: `${"a".repeat(300)}.svg` } });
    expect((await run(d)).status).toBe("saved");
    expect(uploadedAs(d).name).toBe(`${"a".repeat(115)}.webp`);
  });

  it("a long name keeps its suffix inside 120 characters when the first name is taken", async () => {
    const long = "a".repeat(300);
    const d = deps({ old: { ...OLD_FILE, name: `${long}.svg` }, files: [folderFile("x", `${"a".repeat(115)}.webp`, OTHER)] });
    expect((await run(d)).status).toBe("saved");
    expect(uploadedAs(d).name).toBe(`${"a".repeat(113)}-2.webp`);
  });
});

describe("replaceImage: an unreadable sibling skips to the next name", () => {
  it("a same-name file on a host not on the list is skipped, not a stop", async () => {
    const d = deps({ files: [folderFile("odd", "logo.webp", "https://evil.example/logo.webp")] });
    expect((await run(d)).status).toBe("saved");
    expect(uploadedAs(d)).toMatchObject({ name: "logo-2.webp" });
    expect(d.fetchBytes).not.toHaveBeenCalledWith("https://evil.example/logo.webp", expect.anything());
  });

  it("a same-name file whose bytes cannot be fetched is skipped, not a stop", async () => {
    const d = deps({ files: [folderFile("odd", "logo.webp", OTHER)], bytes: { [OTHER]: null } });
    expect((await run(d)).status).toBe("saved");
    expect(uploadedAs(d)).toMatchObject({ name: "logo-2.webp" });
  });

  it("every name taken by other files: ambiguous, nothing uploaded", async () => {
    const taken = ["logo.webp", ...[2, 3, 4, 5, 6, 7, 8].map((n) => `logo-${n}.webp`)].map((name, n) => folderFile(`t${n}`, name, `${OTHER}${n}`));
    const d = deps({ files: taken });
    expect(await run(d)).toEqual({ status: "ambiguous" });
    expect(d.upload).not.toHaveBeenCalled();
  });
});

describe("replaceImage: format change stops and failures", () => {
  it("a busy tenant (claim returns null) answers busy and calls nothing", async () => {
    const d = deps();
    d.claim.mockResolvedValue(null);
    expect(await run(d)).toEqual({ status: "busy" });
    expect(d.find).not.toHaveBeenCalled();
    expect(d.upload).not.toHaveBeenCalled();
    expect(d.release).not.toHaveBeenCalled();
  });

  it("the live file cannot be read and an identical copy is in the folder: retry, no PUT", async () => {
    const d = deps({ files: [folderFile("earlier", "logo.webp", OTHER)], bytes: { [OLD]: null, [OTHER]: BYTES } });
    expect(await run(d)).toEqual({ status: "retry" });
    expect(d.update).not.toHaveBeenCalled();
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("the picked file is the live one (same bytes): saved as it is, no library, upload or PUT", async () => {
    const d = deps({ bytes: { [OLD]: BYTES } });
    expect(await run(d)).toEqual({ status: "saved", url: OLD, oldFile: "same" });
    expect(d.library).not.toHaveBeenCalled();
    expect(d.upload).not.toHaveBeenCalled();
    expect(d.update).not.toHaveBeenCalled();
  });

  it("past the upload cutoff: retry, nothing uploaded", async () => {
    const d = deps();
    d.now.mockReturnValueOnce(0).mockReturnValue(20_000);
    expect(await run(d)).toEqual({ status: "retry" });
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("the value changed in HighLevel during the upload: conflict, the new upload trashed, the old file and the other edit kept", async () => {
    const d = deps();
    d.upload.mockImplementation(async () => {
      (d.store.get(KEY) as CustomValueDetail).value = OTHER;
      return { kind: "uploaded", fileId: "f1", url: NEW };
    });
    expect(await run(d)).toEqual({ status: "conflict", current: OTHER });
    expect(d.update).not.toHaveBeenCalled();
    expect(d.trash).toHaveBeenCalledExactlyOnceWith("T1", "f1");
    expect(d.store.get(KEY)?.value).toBe(OTHER);
  });

  it("the PUT is accepted but the read-back still shows the old value: unknown, nothing trashed, lease kept", async () => {
    const d = deps();
    d.update.mockResolvedValue("saved");
    expect(await run(d)).toEqual({ status: "unknown" });
    expect(d.trash).not.toHaveBeenCalled();
    expect(d.store.get(KEY)?.value).toBe(OLD);
    expect(d.release).not.toHaveBeenCalled();
  });

  it("an upload answered on a host not on the list: bad_host, that upload trashed, the value unchanged", async () => {
    const BAD = "https://evil.example/x/new.webp";
    const d = deps({ uploaded: { kind: "uploaded", fileId: "f1", url: BAD } });
    expect(await run(d)).toEqual({ status: "bad_host" });
    expect(d.update).not.toHaveBeenCalled();
    expect(d.trash).toHaveBeenCalledExactlyOnceWith("T1", "f1");
    expect(d.store.get(KEY)?.value).toBe(OLD);
  });

  it("a lock that lands during the upload: locked, the upload removed, the old file kept", async () => {
    const d = { ...deps(), locks: vi.fn<NonNullable<MediaDeps["locks"]>>() };
    d.locks.mockResolvedValueOnce(new Set()).mockResolvedValue(new Set([KEY]));
    expect(await run(d)).toEqual({ status: "locked" });
    expect(d.upload).toHaveBeenCalledTimes(1);
    expect(d.update).not.toHaveBeenCalled();
    expect(d.trash).toHaveBeenCalledExactlyOnceWith("T1", "f1");
  });

  it("the new file's stored bytes differ from the ones sent: unproven, the old file kept", async () => {
    const d = deps({ bytes: { [NEW]: ELSE_BYTES } });
    expect(await run(d)).toEqual({ status: "saved", url: NEW, oldFile: "unproven" });
    expect(d.trash).not.toHaveBeenCalled();
  });

  it("only the trash call is ever used to remove a file, never a permanent delete", async () => {
    const d = { ...deps(), delete: vi.fn(), remove: vi.fn(), deleteFile: vi.fn() };
    expect((await run(d)).oldFile).toBe("trashed");
    expect(d.trash).toHaveBeenCalledExactlyOnceWith("T1", "old-id");
    for (const mock of [d.delete, d.remove, d.deleteFile]) expect(mock).not.toHaveBeenCalled();
  });
});

describe("POST /api/settings/media: which key takes which format", () => {
  it("the favicon takes a photo over its SVG, saved as a new file next to it", async () => {
    const icon: MediaFile = { id: "old-id", name: "favicon.svg", url: "https://assets.cdn.filesafe.space/x/favicon.svg", parentId: FOLDER };
    const media = deps({ old: icon });
    media.store.set("business_favicon_url", row("business_favicon_url", icon.url));
    media.store.delete(KEY);
    const post = routeTo(media);
    const response = await post("business_favicon_url", icon.url, new Blob([lossy(100, 100) as BlobPart], { type: "image/webp" }));
    expect(await response.json()).toEqual({ status: "saved", url: NEW, oldFile: "trashed" });
    expect(uploadedAs(media)).toMatchObject({ name: "favicon.webp", parentId: FOLDER, contentType: "image/webp" });
  });

  it("a photo key refuses an SVG before anything is called (current rule: SVG only on the logo and favicon)", async () => {
    const media = deps();
    const replace = vi.fn<MediaRouteDeps["replace"]>();
    const post = routeTo(media, { replace });
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0"/></svg>'], { type: "image/svg+xml" });
    const response = await post("business_main_background_video_or_image", "", svg);
    expect(response.status).toBe(400);
    expect(replace).not.toHaveBeenCalled();
  });
});
