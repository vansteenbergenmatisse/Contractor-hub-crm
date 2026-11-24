import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomValueDetail, MediaFile, MediaFolder, MediaFolderOutcome, MediaLibrary, MediaUploadOutcome } from "@/features/highlevel";
import { replaceImage, type MediaDeps } from "@/features/settings-write-back";

// An empty image value: a plain upload into the matching library folder, then the value is written.
// Mocked HighLevel and database only. All values are fake.
const KEY = "partner1_logo";
const FOLDER_NAME = "07.1_Sections_Partners";
const NEW = "https://files.leadconnectorhq.com/x/new";
const BYTES = new Uint8Array([1, 2, 3, 4]);
const HASH = createHash("sha256").update(BYTES).digest("hex");
const FILE = { bytes: BYTES, contentType: "image/webp", extension: "webp", hash: HASH };
const FILE_NAME = `${KEY}.webp`;
const row = (key: string, value: string): CustomValueDetail => ({ id: `id-${key}`, key, name: `Name ${key}`, value });
const folder = (id: string, name: string, parentId: string | null = null): MediaFolder => ({ id, name, parentId });

type Options = {
  libraries?: MediaLibrary[];
  created?: MediaFolderOutcome;
  uploaded?: MediaUploadOutcome;
  folderName?: string | null;
  fetched?: Uint8Array | null;
};

function deps(options: Options = {}) {
  const store = new Map([[KEY, row(KEY, "")]]);
  const libraries = [...(options.libraries ?? [{ ok: true, files: [], folders: [folder("p1", FOLDER_NAME)] }])];
  const calls: string[] = [];
  const d = {
    store,
    calls,
    read: vi.fn<MediaDeps["read"]>(async () => ({ ok: true, values: [...store.values()].map((item) => ({ ...item })) })),
    update: vi.fn<MediaDeps["update"]>(async (_tenant, target, value) => {
      calls.push("put");
      (store.get(target.key) as CustomValueDetail).value = value;
      return "saved";
    }),
    begin: vi.fn<MediaDeps["begin"]>(async () => "audit"),
    finish: vi.fn<MediaDeps["finish"]>(async () => {}),
    invalidate: vi.fn<MediaDeps["invalidate"]>(),
    claim: vi.fn<MediaDeps["claim"]>(async () => "holder"),
    release: vi.fn<MediaDeps["release"]>(async () => {}),
    now: vi.fn<MediaDeps["now"]>(() => 0),
    find: vi.fn<MediaDeps["find"]>(async () => ({ ok: true, files: [], siblings: [] })),
    verify: vi.fn<MediaDeps["verify"]>(async () => true),
    trash: vi.fn<MediaDeps["trash"]>(async () => "trashed"),
    upload: vi.fn<MediaDeps["upload"]>(async () => {
      calls.push("upload");
      return options.uploaded ?? { kind: "uploaded", fileId: "f1", url: NEW };
    }),
    fetchBytes: vi.fn<MediaDeps["fetchBytes"]>(async () => (options.fetched === undefined ? BYTES : options.fetched)),
    readAll: vi.fn<MediaDeps["readAll"]>(async () => ({ ok: true, rows: [...store.values()].map(({ key, value }) => ({ key, value })) })),
    hosts: ["assets.cdn.filesafe.space", "files.leadconnectorhq.com"],
    library: vi.fn<NonNullable<MediaDeps["library"]>>(async () => {
      calls.push("library");
      return libraries.length > 1 ? (libraries.shift() as MediaLibrary) : libraries[0];
    }),
    createFolder: vi.fn<NonNullable<MediaDeps["createFolder"]>>(async () => {
      calls.push("folder");
      return options.created ?? { kind: "created", id: "new-folder" };
    }),
    folderOf: vi.fn<NonNullable<MediaDeps["folderOf"]>>(() => (options.folderName === undefined ? FOLDER_NAME : options.folderName)),
  };
  return d;
}
const run = (d: MediaDeps, over: Partial<{ expected: string; unlocked: string }> = {}) =>
  replaceImage({ tenantId: "T1", actorId: "U1", key: KEY, expected: "", file: FILE, ...over }, d);

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("replaceImage on an empty value: add an image", () => {
  it("uploads into the folder named after the layout folder, then writes the link", async () => {
    const d = deps();
    expect(await run(d)).toEqual({ status: "saved", url: NEW, oldFile: "none" });
    expect(d.calls).toEqual(["library", "upload", "put"]);
    expect(d.folderOf).toHaveBeenCalledWith(KEY);
    expect(d.upload).toHaveBeenCalledWith("T1", expect.objectContaining({ name: FILE_NAME, fileName: FILE_NAME, parentId: "p1", contentType: "image/webp" }));
    expect(d.store.get(KEY)?.value).toBe(NEW);
    expect(d.find).not.toHaveBeenCalled();
    expect(d.trash).not.toHaveBeenCalled();
    expect(d.createFolder).not.toHaveBeenCalled();
    expect(d.release).toHaveBeenCalledWith("T1", "holder");
  });

  it("creates the folder at the top of the library when it is missing", async () => {
    const d = deps({ libraries: [{ ok: true, files: [], folders: [folder("x", "Other")] }] });
    expect((await run(d)).status).toBe("saved");
    expect(d.createFolder).toHaveBeenCalledExactlyOnceWith("T1", FOLDER_NAME, null);
    expect(d.upload).toHaveBeenCalledWith("T1", expect.objectContaining({ parentId: "new-folder" }));
  });

  it("puts the file at the top of the library when the layout folder has no HighLevel name", async () => {
    const d = deps({ folderName: null });
    expect((await run(d)).status).toBe("saved");
    expect(d.createFolder).not.toHaveBeenCalled();
    expect(d.upload).toHaveBeenCalledWith("T1", expect.objectContaining({ parentId: null }));
  });

  it("prefers the one top-level folder when the name is used more than once", async () => {
    const d = deps({ libraries: [{ ok: true, files: [], folders: [folder("deep", FOLDER_NAME, "x"), folder("top", FOLDER_NAME)] }] });
    expect((await run(d)).status).toBe("saved");
    expect(d.upload).toHaveBeenCalledWith("T1", expect.objectContaining({ parentId: "top" }));
  });

  it("stops before any write when the folder cannot be told apart", async () => {
    const d = deps({ libraries: [{ ok: true, files: [], folders: [folder("a", FOLDER_NAME), folder("b", FOLDER_NAME)] }] });
    expect(await run(d)).toEqual({ status: "ambiguous" });
    expect(d.upload).not.toHaveBeenCalled();
    expect(d.update).not.toHaveBeenCalled();
  });

  it("reuses a same-name file in the folder with the same bytes, with no second upload", async () => {
    const earlier: MediaFile = { id: "e1", name: FILE_NAME, url: NEW, parentId: "p1" };
    const d = deps({ libraries: [{ ok: true, files: [earlier], folders: [folder("p1", FOLDER_NAME)] }] });
    expect(await run(d)).toEqual({ status: "saved", url: NEW, oldFile: "none" });
    expect(d.upload).not.toHaveBeenCalled();
  });

  it.each([
    ["permission", "needs_approval"],
    ["incomplete", "library_limit"],
    ["connection", "connection"],
    ["retry", "retry"],
  ] as const)("library read %s stops as %s", async (reason, status) => {
    const d = deps({ libraries: [{ ok: false, reason }] });
    expect(await run(d)).toEqual({ status });
    expect(d.upload).not.toHaveBeenCalled();
  });

  it.each([
    ["unconfirmed", "retry"],
    ["permission", "needs_approval"],
    ["rejected", "rejected"],
  ] as const)("folder create %s stops as %s with no upload", async (kind, status) => {
    const d = deps({ libraries: [{ ok: true, files: [], folders: [] }], created: { kind } });
    expect(await run(d)).toEqual({ status });
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("finds an upload that gave no answer by its bytes, and does not upload again", async () => {
    const landed: MediaFile = { id: "f9", name: FILE_NAME, url: NEW, parentId: "p1" };
    const d = deps({
      uploaded: { kind: "no_answer" },
      libraries: [
        { ok: true, files: [], folders: [folder("p1", FOLDER_NAME)] },
        { ok: true, files: [landed], folders: [folder("p1", FOLDER_NAME)] },
      ],
    });
    expect(await run(d)).toEqual({ status: "saved", url: NEW, oldFile: "none" });
    expect(d.upload).toHaveBeenCalledTimes(1);
  });

  it("keeps the lease and says unknown when an unanswered upload cannot be found", async () => {
    const d = deps({ uploaded: { kind: "no_answer" } });
    expect(await run(d)).toEqual({ status: "unknown" });
    expect(d.release).not.toHaveBeenCalled();
    expect(d.update).not.toHaveBeenCalled();
  });

  it("refuses a link on a host that is not allowed, and removes the new file", async () => {
    const d = deps({ uploaded: { kind: "uploaded", fileId: "f1", url: "https://evil.test/x" } });
    expect((await run(d)).status).toBe("bad_host");
    expect(d.update).not.toHaveBeenCalled();
  });

  it("refuses when the value is no longer empty", async () => {
    const d = deps();
    d.store.set(KEY, row(KEY, "https://files.leadconnectorhq.com/x/someone-else"));
    expect(await run(d)).toEqual({ status: "conflict", current: "https://files.leadconnectorhq.com/x/someone-else" });
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("keeps the old rule (not found) when the add deps are not given", async () => {
    const d: Partial<ReturnType<typeof deps>> = deps();
    delete d.library;
    delete d.createFolder;
    delete d.folderOf;
    expect(await run(d as MediaDeps)).toEqual({ status: "not_found" });
  });
});
