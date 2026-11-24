import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomValueDetail, MediaFile, MediaFolder, MediaFolderOutcome, MediaLibrary, MediaUploadOutcome } from "@/features/highlevel";
import { replaceImage, type MediaDeps } from "@/features/settings-write-back";

// Review fixes for the add path: an outside link, the folder audit, a lagging folder list, the
// folder stop, and the failures after an upload. Mocked HighLevel and database only. Fake values.
const KEY = "partner1_logo";
const FOLDER_NAME = "07.1_Sections_Partners";
const NEW = "https://files.leadconnectorhq.com/x/new";
const OUTSIDE = "https://example.test/pasted.png";
const BYTES = new Uint8Array([1, 2, 3, 4]);
const HASH = createHash("sha256").update(BYTES).digest("hex");
const FILE = { bytes: BYTES, contentType: "image/webp", extension: "webp", hash: HASH };
const FILE_NAME = `${KEY}.webp`;
const row = (key: string, value: string): CustomValueDetail => ({ id: `id-${key}`, key, name: `Name ${key}`, value });
const folder = (id: string, name: string, parentId: string | null = null): MediaFolder => ({ id, name, parentId });

type Options = {
  current?: string;
  libraries?: MediaLibrary[];
  created?: MediaFolderOutcome;
  uploaded?: MediaUploadOutcome;
  put?: Awaited<ReturnType<MediaDeps["update"]>>;
};

function deps(options: Options = {}) {
  const store = new Map([[KEY, row(KEY, options.current ?? "")]]);
  const libraries = [...(options.libraries ?? [{ ok: true, files: [], folders: [folder("p1", FOLDER_NAME)] }])];
  return {
    store,
    read: vi.fn<MediaDeps["read"]>(async () => ({ ok: true, values: [...store.values()].map((item) => ({ ...item })) })),
    update: vi.fn<MediaDeps["update"]>(async (_tenant, target, value) => {
      const put = options.put ?? "saved";
      if (put === "saved") (store.get(target.key) as CustomValueDetail).value = value;
      return put;
    }),
    begin: vi.fn<MediaDeps["begin"]>(async () => "audit"),
    finish: vi.fn<MediaDeps["finish"]>(async () => {}),
    invalidate: vi.fn<MediaDeps["invalidate"]>(),
    claim: vi.fn<MediaDeps["claim"]>(async () => "holder"),
    release: vi.fn<MediaDeps["release"]>(async () => {}),
    now: vi.fn<MediaDeps["now"]>(() => 0),
    wait: vi.fn<NonNullable<MediaDeps["wait"]>>(async () => {}),
    find: vi.fn<MediaDeps["find"]>(async () => ({ ok: true, files: [], siblings: [] })),
    verify: vi.fn<MediaDeps["verify"]>(async () => true),
    trash: vi.fn<MediaDeps["trash"]>(async () => "trashed"),
    upload: vi.fn<MediaDeps["upload"]>(async () => options.uploaded ?? { kind: "uploaded", fileId: "f1", url: NEW }),
    fetchBytes: vi.fn<MediaDeps["fetchBytes"]>(async () => BYTES),
    readAll: vi.fn<MediaDeps["readAll"]>(async () => ({ ok: true, rows: [...store.values()].map(({ key, value }) => ({ key, value })) })),
    hosts: ["assets.cdn.filesafe.space", "files.leadconnectorhq.com"],
    library: vi.fn<NonNullable<MediaDeps["library"]>>(async () => (libraries.length > 1 ? (libraries.shift() as MediaLibrary) : libraries[0])),
    createFolder: vi.fn<NonNullable<MediaDeps["createFolder"]>>(async () => options.created ?? { kind: "created", id: "new-folder" }),
    folderOf: vi.fn<NonNullable<MediaDeps["folderOf"]>>(() => FOLDER_NAME),
  };
}
const run = (d: MediaDeps, expected = "") => replaceImage({ tenantId: "T1", actorId: "U1", key: KEY, expected, file: FILE }, d);

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("replaceImage: a value that is not a library file", () => {
  it("uploads into the layout folder and writes the link, leaving the outside file alone", async () => {
    const d = deps({ current: OUTSIDE });
    expect(await run(d, OUTSIDE)).toEqual({ status: "saved", url: NEW, oldFile: "outside" });
    expect(d.find).toHaveBeenCalledWith("T1", OUTSIDE);
    expect(d.upload).toHaveBeenCalledWith("T1", expect.objectContaining({ name: FILE_NAME, parentId: "p1" }));
    expect(d.store.get(KEY)?.value).toBe(NEW);
    expect(d.trash).not.toHaveBeenCalled();
  });

  it("still stops on a library file it cannot tell apart, with no upload", async () => {
    const d = deps({ current: OUTSIDE });
    d.find.mockResolvedValue({ ok: true, files: [{ id: "a", name: "a", url: OUTSIDE, parentId: null }, { id: "b", name: "b", url: OUTSIDE, parentId: null }], siblings: [] });
    expect(await run(d, OUTSIDE)).toEqual({ status: "ambiguous" });
    expect(d.upload).not.toHaveBeenCalled();
  });
});

describe("replaceImage add path: the folder create is audited", () => {
  it("opens an audit row naming the folder before the create and closes it as saved", async () => {
    const d = deps({ libraries: [{ ok: true, files: [], folders: [] }] });
    expect((await run(d)).status).toBe("saved");
    expect(d.begin).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "T1", actorId: "U1", key: KEY, newValue: `folder:${FOLDER_NAME}` }));
    expect(d.begin.mock.invocationCallOrder[0]).toBeLessThan(d.createFolder.mock.invocationCallOrder[0]);
    expect(d.finish).toHaveBeenCalledWith("audit", "saved");
  });

  it.each([
    ["permission", "permission"],
    ["rejected", "rejected"],
    ["unconfirmed", "unknown"],
    ["retry", "failed"],
  ] as const)("closes the folder audit for %s as %s", async (kind, outcome) => {
    const d = deps({ libraries: [{ ok: true, files: [], folders: [] }], created: { kind } });
    await run(d);
    expect(d.finish).toHaveBeenCalledWith("audit", outcome);
  });

  it("makes no folder when the audit row cannot be opened", async () => {
    const d = deps({ libraries: [{ ok: true, files: [], folders: [] }] });
    d.begin.mockRejectedValue(new Error("db down"));
    expect(await run(d)).toEqual({ status: "retry" });
    expect(d.createFolder).not.toHaveBeenCalled();
  });
});

describe("replaceImage add path: a create with no clear answer", () => {
  it("uses the folder when the library shows it right after, and creates it only once", async () => {
    const d = deps({
      created: { kind: "unconfirmed" },
      libraries: [{ ok: true, files: [], folders: [] }, { ok: true, files: [], folders: [folder("late", FOLDER_NAME)] }],
    });
    expect((await run(d)).status).toBe("saved");
    expect(d.createFolder).toHaveBeenCalledTimes(1);
    expect(d.upload).toHaveBeenCalledWith("T1", expect.objectContaining({ parentId: "late" }));
  });

  it("stops as retry when the library still does not show it, with one create and no upload", async () => {
    const d = deps({ created: { kind: "unconfirmed" }, libraries: [{ ok: true, files: [], folders: [] }] });
    expect(await run(d)).toEqual({ status: "retry" });
    expect(d.createFolder).toHaveBeenCalledTimes(1);
    expect(d.upload).not.toHaveBeenCalled();
  });
});

describe("replaceImage add path: stops are named", () => {
  it("stops on nested same-name folders it cannot tell apart, with no create and no upload", async () => {
    const d = deps({ libraries: [{ ok: true, files: [], folders: [folder("a", FOLDER_NAME, "x"), folder("b", FOLDER_NAME, "y")] }] });
    expect(await run(d)).toEqual({ status: "ambiguous" });
    expect(d.createFolder).not.toHaveBeenCalled();
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("stops as rejected when the upload is refused, with no write", async () => {
    const d = deps({ uploaded: { kind: "rejected" } });
    expect(await run(d)).toEqual({ status: "rejected" });
    expect(d.update).not.toHaveBeenCalled();
    expect(d.finish).toHaveBeenCalledWith("audit", "rejected");
  });

  it("never trashes a reused earlier file when the save then fails", async () => {
    const earlier: MediaFile = { id: "e1", name: FILE_NAME, url: NEW, parentId: "p1" };
    const d = deps({ libraries: [{ ok: true, files: [earlier], folders: [folder("p1", FOLDER_NAME)] }], put: "rejected" });
    const answer = await run(d);
    expect(answer.status).not.toBe("saved");
    expect(d.upload).not.toHaveBeenCalled();
    expect(d.trash).not.toHaveBeenCalled();
  });
});
