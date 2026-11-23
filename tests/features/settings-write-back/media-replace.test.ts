import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomValueDetail, MediaFind, MediaUploadOutcome } from "@/features/highlevel";
import { replaceImage, type MediaDeps } from "@/features/settings-write-back";

// Mocked HighLevel and database only. All values are fake.
const KEY = "1_our_work_after";
const OLD = "https://assets.cdn.filesafe.space/x/old.webp";
const NEW = "https://files.leadconnectorhq.com/x/new";
const BYTES = new Uint8Array([1, 2, 3, 4]);
const OLD_BYTES = new Uint8Array([5, 6, 7, 8]);
const OTHER = "https://files.leadconnectorhq.com/x/earlier";
const HASH = createHash("sha256").update(BYTES).digest("hex");
const NAME = "Project photo.webp";
const FOLDER = "folder-1";
const OLD_FILE = { id: "old-id", name: NAME, url: OLD, parentId: FOLDER };
const SAVED = { status: "saved", url: NEW, oldFile: "trashed" };
const FILE = { bytes: BYTES, contentType: "image/webp", extension: "webp", hash: HASH };
const none: MediaFind = { ok: true, files: [OLD_FILE], siblings: [] };
const row = (key: string, value: string): CustomValueDetail => ({ id: `id-${key}`, key, name: `Name ${key}`, value });

type Options = {
  found?: MediaFind | MediaFind[];
  uploaded?: MediaUploadOutcome;
  fetched?: Uint8Array | null;
  uploadLands?: boolean;
  putFails?: "rejected" | "permission" | "retry" | "no_answer";
};

function deps(options: Options = {}) {
  const store = new Map([[KEY, row(KEY, OLD)]]);
  const founds = Array.isArray(options.found) ? [...options.found] : null;
  const calls: string[] = [];
  let audits = 0;
  const d = {
    store,
    calls,
    read: vi.fn<MediaDeps["read"]>(async () => ({ ok: true, values: [...store.values()].map((item) => ({ ...item })) })),
    update: vi.fn<MediaDeps["update"]>(async (_tenant, target, value) => {
      calls.push("put");
      if (options.putFails && options.putFails !== "no_answer") return options.putFails;
      (store.get(target.key) as CustomValueDetail).value = value;
      return options.putFails ?? "saved";
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
      if (founds) return founds.shift() ?? none;
      return (options.found as MediaFind | undefined) ?? none;
    }),
    verify: vi.fn<MediaDeps["verify"]>(async () => {
      calls.push("verify");
      return true;
    }),
    trash: vi.fn<MediaDeps["trash"]>(async () => {
      calls.push("trash");
      return "trashed";
    }),
    upload: vi.fn<MediaDeps["upload"]>(async () => {
      calls.push("upload");
      return options.uploaded ?? { kind: "uploaded", fileId: "f1", url: NEW };
    }),
    // The current file holds other bytes than the new image, unless a test says otherwise.
    fetchBytes: vi.fn<MediaDeps["fetchBytes"]>(async (url) => (url === OLD ? OLD_BYTES : options.fetched === undefined ? BYTES : options.fetched)),
    readAll: vi.fn<MediaDeps["readAll"]>(async () => ({ ok: true, rows: [...store.values()].map(({ key, value }) => ({ key, value })) })),
    hosts: ["assets.cdn.filesafe.space", "files.leadconnectorhq.com"],
  };
  return d;
}
const run = (d: MediaDeps, over: Partial<{ tenantId: string; expected: string }> = {}) =>
  replaceImage({ tenantId: "T1", actorId: "U1", key: KEY, expected: OLD, file: FILE, ...over }, d);
const hit = (url = NEW): MediaFind => ({ ok: true, files: [OLD_FILE], siblings: [{ id: "sibling", name: NAME, url, parentId: FOLDER }] });

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("replaceImage: the good path", () => {
  it("finds the old file, uploads under its name and folder, saves, then trashes the old file", async () => {
    const d = deps();
    expect(await run(d)).toEqual(SAVED);
    expect(d.calls).toEqual(["find", "audit", "upload", "audit", "put", "verify", "verify", "audit", "trash"]);
    expect(d.verify.mock.calls[0]).toEqual(["T1", { id: "f1", name: NAME, url: NEW, parentId: FOLDER }]);
    expect(d.fetchBytes).toHaveBeenLastCalledWith(NEW, 2 * 1024 * 1024);
    expect(d.find).toHaveBeenCalledWith("T1", OLD);
    expect(d.store.get(KEY)?.value).toBe(NEW);
    expect(d.upload).toHaveBeenCalledWith("T1", expect.objectContaining({ name: NAME, fileName: NAME, parentId: FOLDER, contentType: "image/webp" }));
    expect(d.begin.mock.calls[0][0]).toMatchObject({ tenantId: "T1", actorId: "U1", key: KEY, previousValue: OLD, newValue: `upload:${KEY}-${HASH.slice(0, 12)}` });
    expect(d.begin.mock.calls[1][0]).toMatchObject({ key: KEY, previousValue: OLD, newValue: NEW });
    expect(d.begin.mock.calls[2][0]).toMatchObject({ key: KEY, previousValue: OLD, newValue: "trash:old-id" });
    expect(JSON.stringify(d.begin.mock.calls)).not.toContain("[1,2,3,4]");
    expect(d.verify).toHaveBeenCalledWith("T1", OLD_FILE);
    expect(d.trash).toHaveBeenCalledExactlyOnceWith("T1", "old-id");
    expect(d.release).toHaveBeenCalledWith("T1", "holder");
  });

  it("reuses a file already there after checking its real bytes, with no second upload", async () => {
    const d = deps({ found: hit() });
    expect(await run(d)).toEqual(SAVED);
    expect(d.fetchBytes).toHaveBeenCalledWith(NEW, 2 * 1024 * 1024);
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("holds the tenant lease for the whole replace and claims it once", async () => {
    const d = deps();
    await run(d);
    expect(d.claim).toHaveBeenCalledTimes(1);
    expect(d.release).toHaveBeenCalledTimes(1);
  });
});

describe("replaceImage: stops before any external write", () => {
  it("answers busy when another save holds the lease", async () => {
    const d = deps();
    d.claim.mockResolvedValue(null);
    expect(await run(d)).toEqual({ status: "busy" });
    expect(d.find).not.toHaveBeenCalled();
    expect(d.release).not.toHaveBeenCalled();
  });

  it("answers try again when the lease cannot be read", async () => {
    const d = deps();
    d.claim.mockRejectedValue(new Error("db"));
    expect(await run(d)).toEqual({ status: "retry" });
  });

  it("refuses when the value changed since the owner loaded it, before uploading", async () => {
    const d = deps();
    expect(await run(d, { expected: "https://assets.cdn.filesafe.space/x/other.webp" })).toEqual({ status: "conflict", current: OLD });
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("answers missing when the account has no such key", async () => {
    const d = deps();
    d.store.clear();
    expect(await run(d)).toEqual({ status: "missing" });
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("answers duplicate when the key is listed twice", async () => {
    const d = deps();
    d.read.mockResolvedValue({ ok: true, values: [], duplicates: [{ key: KEY, value: OLD }] });
    expect(await run(d)).toEqual({ status: "duplicate" });
    expect(d.upload).not.toHaveBeenCalled();
  });

  it.each([["permission", "connection"], ["retry", "retry"]] as const)("maps a failed read (%s) to %s", async (reason, status) => {
    const d = deps();
    d.read.mockResolvedValue({ ok: false, reason });
    expect(await run(d)).toEqual({ status });
    expect(d.find).not.toHaveBeenCalled();
  });

  it("shows needs re-approval when the media list is refused", async () => {
    const d = deps({ found: { ok: false, reason: "permission" } });
    expect(await run(d)).toEqual({ status: "needs_approval" });
    expect(d.upload).not.toHaveBeenCalled();
    expect(d.update).not.toHaveBeenCalled();
  });

  it("does not upload when the lookup could not be done", async () => {
    const d = deps({ found: { ok: false, reason: "retry" } });
    expect(await run(d)).toEqual({ status: "retry" });
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("does not upload without an audit row", async () => {
    const d = deps();
    d.begin.mockRejectedValue(new Error("db"));
    expect(await run(d)).toEqual({ status: "retry" });
    expect(d.upload).not.toHaveBeenCalled();
    expect(d.store.get(KEY)?.value).toBe(OLD);
  });

  it("does not start an upload when the time budget is spent", async () => {
    const d = deps();
    d.now.mockReturnValueOnce(0).mockReturnValue(16_000);
    expect(await run(d)).toEqual({ status: "retry" });
    expect(d.upload).not.toHaveBeenCalled();
  });
});

describe("replaceImage: a name match is not proof", () => {
  it("treats a same-name file with other bytes as no match: it uploads and leaves that file alone", async () => {
    const d = deps({ found: hit(OTHER) });
    d.fetchBytes.mockImplementation(async (url) => (url === OTHER ? new Uint8Array([9, 9, 9, 9]) : url === OLD ? OLD_BYTES : BYTES));
    expect(await run(d)).toEqual(SAVED);
    expect(d.upload).toHaveBeenCalledTimes(1);
    expect(d.trash).toHaveBeenCalledExactlyOnceWith("T1", "old-id");
    expect(d.trash).not.toHaveBeenCalledWith("T1", "sibling");
  });

  it("stops when the file cannot be fetched to compare", async () => {
    const d = deps({ found: hit(), fetched: null });
    expect(await run(d)).toEqual({ status: "retry" });
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("never fetches a matched file on an unapproved host", async () => {
    const d = deps({ found: hit("https://evil.test/x") });
    expect(await run(d)).toEqual({ status: "bad_host" });
    expect(d.fetchBytes).not.toHaveBeenCalled();
    expect(d.update).not.toHaveBeenCalled();
  });
});

describe("replaceImage: upload errors leave the old value live", () => {
  it.each([
    ["rejected", "rejected"], ["permission", "needs_approval"], ["retry", "retry"],
  ] as const)("upload answer %s gives %s, with no PUT and no second upload", async (kind, status) => {
    const d = deps({ uploaded: { kind } });
    expect(await run(d)).toEqual({ status });
    expect(d.upload).toHaveBeenCalledTimes(1);
    expect(d.update).not.toHaveBeenCalled();
    expect(d.store.get(KEY)?.value).toBe(OLD);
    expect(d.finish).toHaveBeenCalledWith("audit-1", kind === "retry" ? "failed" : kind);
  });

  it("stops before the PUT on an unapproved URL host and never widens the list", async () => {
    const d = deps({ uploaded: { kind: "uploaded", fileId: "f1", url: "https://storage.googleapis.com/b/x.webp" } });
    expect(await run(d)).toEqual({ status: "bad_host" });
    expect(d.update).not.toHaveBeenCalled();
    expect(d.hosts).toEqual(["assets.cdn.filesafe.space", "files.leadconnectorhq.com"]);
    expect(d.store.get(KEY)?.value).toBe(OLD);
  });

  it.each(["http://files.leadconnectorhq.com/x", "https://u:p@files.leadconnectorhq.com/x", "https://files.leadconnectorhq.com:8443/x", "https://files.leadconnectorhq.com.evil.test/x", "not a url"])("refuses the returned URL %s", async (url) => {
    const d = deps({ uploaded: { kind: "uploaded", fileId: "f1", url } });
    expect(await run(d)).toEqual({ status: "bad_host" });
    expect(d.update).not.toHaveBeenCalled();
  });

  it("does not PUT when the time budget ran out during the upload", async () => {
    const d = deps();
    d.now.mockReturnValueOnce(0).mockReturnValueOnce(1_000).mockReturnValue(36_000);
    expect(await run(d)).toEqual({ status: "retry" });
    expect(d.update).not.toHaveBeenCalled();
    expect(d.store.get(KEY)?.value).toBe(OLD);
  });
});

describe("replaceImage: no answer on upload", () => {
  it("re-reads, never uploads again, and continues when the verified file is there", async () => {
    const d = deps({ uploaded: { kind: "no_answer" }, found: [none, hit()] });
    expect(await run(d)).toEqual(SAVED);
    expect(d.upload).toHaveBeenCalledTimes(1);
    expect(d.find).toHaveBeenCalledTimes(2);
    expect(d.finish).toHaveBeenCalledWith("audit-1", "saved");
  });

  it("reports unknown when the file is still absent, because the list may lag, and keeps the lease", async () => {
    const d = deps({ uploaded: { kind: "no_answer" } });
    expect(await run(d)).toEqual({ status: "unknown" });
    expect(d.upload).toHaveBeenCalledTimes(1);
    expect(d.update).not.toHaveBeenCalled();
    expect(d.release).not.toHaveBeenCalled();
    expect(d.finish).toHaveBeenCalledWith("audit-1", "unknown");
    expect(d.store.get(KEY)?.value).toBe(OLD);
  });

  it("reports unknown when the re-read fails", async () => {
    const d = deps({ uploaded: { kind: "no_answer" }, found: [none, { ok: false, reason: "retry" }] });
    expect(await run(d)).toEqual({ status: "unknown" });
    expect(d.upload).toHaveBeenCalledTimes(1);
  });

  it("stops on a hash mismatch found by the re-read", async () => {
    const d = deps({ uploaded: { kind: "no_answer" }, found: [none, hit()], fetched: new Uint8Array([7, 7, 7, 7]) });
    expect(await run(d)).toEqual({ status: "hash_mismatch" });
    expect(d.update).not.toHaveBeenCalled();
  });
});

describe("replaceImage: partial failure at the PUT", () => {
  it.each([["rejected", "rejected"], ["permission", "connection"], ["retry", "retry"]] as const)("PUT %s leaves the old value and gives %s", async (putFails, status) => {
    const d = deps({ putFails });
    expect(await run(d)).toEqual({ status });
    expect(d.update).toHaveBeenCalledTimes(1);
    expect(d.store.get(KEY)?.value).toBe(OLD);
    expect(d.release).toHaveBeenCalledTimes(1);
  });

  it("PUT without an answer that did land is confirmed by the read", async () => {
    const d = deps({ putFails: "no_answer" });
    expect(await run(d)).toEqual(SAVED);
    expect(d.update).toHaveBeenCalledTimes(1);
  });

  it("a PUT the read cannot confirm is unknown and keeps the lease", async () => {
    const d = deps();
    d.read.mockResolvedValueOnce({ ok: true, values: [row(KEY, OLD)] })
      .mockResolvedValueOnce({ ok: true, values: [row(KEY, OLD)] })
      .mockResolvedValue({ ok: false, reason: "retry" });
    expect(await run(d)).toEqual({ status: "unknown" });
    expect(d.release).not.toHaveBeenCalled();
  });

  it("a value edited during the upload is not overwritten", async () => {
    const d = deps();
    d.read.mockResolvedValueOnce({ ok: true, values: [row(KEY, OLD)] }).mockResolvedValue({ ok: true, values: [row(KEY, "https://assets.cdn.filesafe.space/x/edited.webp")] });
    expect(await run(d)).toEqual({ status: "conflict", current: "https://assets.cdn.filesafe.space/x/edited.webp" });
    expect(d.update).not.toHaveBeenCalled();
  });
});

describe("replaceImage: the time budget covers the whole request", () => {
  it("does not PUT after 25 seconds", async () => {
    const d = deps();
    d.now.mockReturnValueOnce(0).mockReturnValueOnce(1_000).mockReturnValue(25_001);
    expect(await run(d)).toEqual({ status: "retry" });
    expect(d.update).not.toHaveBeenCalled();
    expect(d.store.get(KEY)?.value).toBe(OLD);
  });

  it("still PUTs at exactly 25 seconds", async () => {
    const d = deps();
    d.now.mockReturnValueOnce(0).mockReturnValueOnce(1_000).mockReturnValue(25_000);
    expect(await run(d)).toEqual(SAVED);
  });

  it("measures the confirming reads from the start of the replace, so the audit row is closed in time", async () => {
    const d = deps();
    const wait = vi.fn<NonNullable<MediaDeps["wait"]>>(async () => {});
    d.update.mockResolvedValue("saved");
    d.now.mockReturnValueOnce(0).mockReturnValueOnce(1_000).mockReturnValueOnce(24_000).mockReturnValue(36_000);
    expect(await run({ ...d, wait })).toEqual({ status: "unknown" });
    expect(wait).not.toHaveBeenCalled();
    expect(d.finish).toHaveBeenLastCalledWith("audit-2", "unknown");
  });
});

describe("replaceImage: finding the old file", () => {
  it.each([
    ["no file holds the URL", { ok: true, files: [], siblings: [] } as MediaFind, "not_found"],
    ["two files hold the URL", { ok: true, files: [OLD_FILE, { ...OLD_FILE, id: "copy" }], siblings: [] } as MediaFind, "ambiguous"],
    ["the library could not be read to the end", { ok: false, reason: "incomplete" } as MediaFind, "library_limit"],
  ])("stops before any write when %s", async (_name, found, status) => {
    const d = deps({ found });
    expect(await run(d)).toEqual({ status });
    expect(d.begin).not.toHaveBeenCalled();
    expect(d.upload).not.toHaveBeenCalled();
    expect(d.update).not.toHaveBeenCalled();
    expect(d.trash).not.toHaveBeenCalled();
    expect(d.store.get(KEY)?.value).toBe(OLD);
  });

  it("keeps a file at the top of the library at the top", async () => {
    const top = { ...OLD_FILE, parentId: null };
    const d = deps({ found: { ok: true, files: [top], siblings: [] } });
    await run(d);
    expect(d.upload).toHaveBeenCalledWith("T1", expect.objectContaining({ name: NAME, parentId: null }));
  });
});

describe("replaceImage: the file keeps its name, so the format must match", () => {
  const named = (name: string): MediaFind => ({ ok: true, files: [{ ...OLD_FILE, name }], siblings: [] });

  it.each([["logo.png", "png"], ["logo.PNG", "png"], ["a.jpg", "jpeg"], ["a.JPEG", "jpeg"], ["a.svg", "svg"]])("refuses a WebP for %s and names the format", async (name, format) => {
    const d = deps({ found: named(name) });
    expect(await run(d)).toEqual({ status: "format_mismatch", format });
    expect(d.begin).not.toHaveBeenCalled();
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("refuses a format the browser cannot write, without naming one", async () => {
    const d = deps({ found: named("banner.gif") });
    expect(await run(d)).toEqual({ status: "format_mismatch" });
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("uploads a PNG under a .png name, unchanged", async () => {
    const d = deps({ found: named("logo.png") });
    const answer = await replaceImage({ tenantId: "T1", actorId: "U1", key: KEY, expected: OLD, file: { ...FILE, contentType: "image/png", extension: "png" } }, d);
    expect(answer.status).toBe("saved");
    expect(d.upload).toHaveBeenCalledWith("T1", expect.objectContaining({ name: "logo.png", fileName: "logo.png", contentType: "image/png" }));
  });

  it("uses the URL's extension when the name has none", async () => {
    const d = deps({ found: { ok: true, files: [{ ...OLD_FILE, name: "Team photo", url: OLD.replace(".webp", ".png") }], siblings: [] } });
    d.store.get(KEY)!.value = OLD.replace(".webp", ".png");
    const answer = await run(d, { expected: OLD.replace(".webp", ".png") });
    expect(answer).toEqual({ status: "format_mismatch", format: "png" });
  });

  it("does not read a dot in a name as a format", async () => {
    const d = deps({ found: { ok: true, files: [{ ...OLD_FILE, name: "Logo v1.2", url: "https://assets.cdn.filesafe.space/x/abc" }], siblings: [] } });
    d.store.get(KEY)!.value = "https://assets.cdn.filesafe.space/x/abc";
    d.fetchBytes.mockImplementation(async (url) => (url.endsWith("/abc") ? OLD_BYTES : BYTES));
    expect((await run(d, { expected: "https://assets.cdn.filesafe.space/x/abc" })).status).toBe("saved");
    expect(d.upload).toHaveBeenCalledWith("T1", expect.objectContaining({ name: "Logo v1.2" }));
  });
});

describe("replaceImage: removing the old file", () => {
  it("keeps the old file when another custom value still uses it", async () => {
    const d = deps();
    d.store.set("other_key", row("other_key", OLD));
    expect(await run(d)).toEqual({ ...SAVED, oldFile: "in_use" });
    expect(d.trash).not.toHaveBeenCalled();
  });

  it("keeps the old file when another value holds its URL inside longer text", async () => {
    const d = deps();
    d.store.set("other_key", row("other_key", `<img src="${OLD}">`));
    expect((await run(d)).oldFile).toBe("in_use");
    expect(d.trash).not.toHaveBeenCalled();
  });

  it("keeps the old file when a value listed twice still uses it", async () => {
    const d = deps();
    d.readAll.mockResolvedValue({ ok: true, rows: [{ key: KEY, value: NEW }, { key: "twice", value: "first" }, { key: "twice", value: OLD }] });
    expect((await run(d)).oldFile).toBe("in_use");
    expect(d.trash).not.toHaveBeenCalled();
  });

  it("keeps the old file when a row without a readable key holds its URL", async () => {
    const d = deps();
    d.readAll.mockResolvedValue({ ok: true, rows: [{ key: KEY, value: NEW }, { key: null, value: OLD }] });
    expect((await run(d)).oldFile).toBe("in_use");
    expect(d.trash).not.toHaveBeenCalled();
  });

  it("keeps the old file when the key itself is listed twice afterwards", async () => {
    const d = deps();
    d.readAll.mockResolvedValue({ ok: true, rows: [{ key: KEY, value: NEW }, { key: KEY, value: NEW }] });
    expect((await run(d)).oldFile).toBe("kept");
    expect(d.trash).not.toHaveBeenCalled();
  });

  it("keeps the old file when the raw values cannot be read or a row is unreadable", async () => {
    const d = deps();
    d.readAll.mockResolvedValue({ ok: false, reason: "retry" });
    expect(await run(d)).toEqual({ ...SAVED, oldFile: "kept" });
    expect(d.trash).not.toHaveBeenCalled();
  });

  it("keeps the old file when its id no longer verifies", async () => {
    const d = deps();
    d.verify.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await run(d)).toEqual({ ...SAVED, oldFile: "kept" });
    expect(d.trash).not.toHaveBeenCalled();
  });

  it("keeps the old file when the listing does not show the new file with its name and folder", async () => {
    const d = deps();
    d.verify.mockResolvedValueOnce(false);
    expect(await run(d)).toEqual({ ...SAVED, oldFile: "unproven" });
    expect(d.verify).toHaveBeenCalledTimes(1);
    expect(d.trash).not.toHaveBeenCalled();
    expect(d.store.get(KEY)?.value).toBe(NEW);
  });

  it.each([
    ["other bytes", new Uint8Array([9])],
    ["no bytes", null],
  ])("keeps the old file when the new file has %s", async (_name, stored) => {
    const d = deps({ fetched: stored });
    expect(await run(d)).toEqual({ ...SAVED, oldFile: "unproven" });
    expect(d.trash).not.toHaveBeenCalled();
  });

  it("does not trash when the time runs out during the checks", async () => {
    const d = deps();
    let late = false;
    d.now.mockImplementation(() => (late ? 40_001 : 0));
    d.verify.mockImplementation(async () => {
      late = true;
      return true;
    });
    expect(await run(d)).toEqual({ ...SAVED, oldFile: "kept" });
    expect(d.begin).toHaveBeenCalledTimes(2);
    expect(d.trash).not.toHaveBeenCalled();
  });

  it("does not trash its own upload past the time limit either", async () => {
    const d = deps({ putFails: "rejected" });
    let late = false;
    d.now.mockImplementation(() => (late ? 40_001 : 0));
    d.verify.mockImplementation(async () => {
      late = true;
      return true;
    });
    expect(await run(d)).toEqual({ status: "rejected", leftover: true });
    expect(d.trash).not.toHaveBeenCalled();
  });

  it("does not remove without an audit row, and the image stays changed", async () => {
    const d = deps();
    d.begin.mockResolvedValueOnce("a1").mockResolvedValueOnce("a2").mockRejectedValueOnce(new Error("db"));
    expect(await run(d)).toEqual({ ...SAVED, oldFile: "kept" });
    expect(d.trash).not.toHaveBeenCalled();
    expect(d.store.get(KEY)?.value).toBe(NEW);
  });

  it.each([["failed", "kept"], ["permission", "kept"], ["unconfirmed", "unconfirmed"]] as const)("reports a trash answer %s as %s, in one attempt", async (outcome, oldFile) => {
    const d = deps();
    d.trash.mockResolvedValue(outcome);
    expect(await run(d)).toEqual({ ...SAVED, oldFile });
    expect(d.trash).toHaveBeenCalledTimes(1);
    expect(d.store.get(KEY)?.value).toBe(NEW);
  });

  it("does not start a removal after the time limit", async () => {
    const d = deps();
    d.now.mockReturnValueOnce(0).mockReturnValueOnce(1_000).mockReturnValueOnce(20_000).mockReturnValue(40_001);
    expect((await run(d)).oldFile).toBe("kept");
    expect(d.trash).not.toHaveBeenCalled();
  });

  it("never removes the old file when HighLevel answers with the old file itself", async () => {
    for (const uploaded of [{ kind: "uploaded", fileId: "old-id", url: NEW }, { kind: "uploaded", fileId: "other", url: OLD }] as MediaUploadOutcome[]) {
      const d = deps({ uploaded });
      expect(await run(d)).toEqual({ status: "unknown" });
      expect(d.update).not.toHaveBeenCalled();
      expect(d.trash).not.toHaveBeenCalled();
    }
  });

  it("never removes anything when the save did not confirm", async () => {
    const d = deps({ putFails: "rejected" });
    await run(d);
    expect(d.trash).not.toHaveBeenCalledWith("T1", "old-id");
  });
});

describe("replaceImage: a failed save cleans up only its own upload", () => {
  it("trashes the file it just uploaded and keeps the old one", async () => {
    const d = deps({ putFails: "rejected" });
    expect(await run(d)).toEqual({ status: "rejected" });
    expect(d.trash).toHaveBeenCalledExactlyOnceWith("T1", "f1");
    expect(d.verify).toHaveBeenCalledWith("T1", { id: "f1", name: NAME, url: NEW, parentId: FOLDER });
    expect(d.store.get(KEY)?.value).toBe(OLD);
  });

  it("reports the new file when it cannot be removed", async () => {
    const d = deps({ putFails: "rejected" });
    d.trash.mockResolvedValue("failed");
    expect(await run(d)).toEqual({ status: "rejected", leftover: true });
  });

  it("leaves the new file alone when a custom value already points at it", async () => {
    const d = deps({ putFails: "rejected" });
    d.store.set("other_key", row("other_key", NEW));
    expect(await run(d)).toEqual({ status: "rejected", leftover: true });
    expect(d.trash).not.toHaveBeenCalled();
  });

  it("never removes after a PUT without a clear answer, because it may have landed", async () => {
    const d = deps();
    d.update.mockResolvedValue("no_answer");
    expect(await run(d)).toEqual({ status: "unknown" });
    expect(d.trash).not.toHaveBeenCalled();
  });

  it("never removes a same-name file from an earlier try", async () => {
    const d = deps({ found: hit(), putFails: "rejected" });
    expect(await run(d)).toEqual({ status: "rejected" });
    expect(d.trash).not.toHaveBeenCalled();
  });

  it("removes an upload whose host is refused", async () => {
    const d = deps({ uploaded: { kind: "uploaded", fileId: "f1", url: "https://storage.googleapis.com/b/x" } });
    expect(await run(d)).toEqual({ status: "bad_host" });
    expect(d.trash).toHaveBeenCalledExactlyOnceWith("T1", "f1");
  });
});

describe("replaceImage: a retry after a partial failure", () => {
  it("reuses the same-name file with the same bytes and creates no second copy", async () => {
    const d = deps({ found: hit() });
    expect(await run(d)).toEqual(SAVED);
    expect(d.upload).not.toHaveBeenCalled();
    expect(d.store.get(KEY)?.value).toBe(NEW);
    expect(d.trash).toHaveBeenCalledExactlyOnceWith("T1", "old-id");
  });

  it("after a kept state, the file the value points at is the current one: the next image replaces it", async () => {
    const current = { id: "current", name: NAME, url: OLD, parentId: FOLDER };
    const earlier = { id: "earlier", name: NAME, url: OTHER, parentId: FOLDER };
    const d = deps({ found: { ok: true, files: [current], siblings: [earlier] } });
    d.fetchBytes.mockImplementation(async (url) => (url === OTHER ? new Uint8Array([9]) : url === OLD ? OLD_BYTES : BYTES));
    expect(await run(d)).toEqual(SAVED);
    expect(d.find).toHaveBeenCalledWith("T1", OLD);
    expect(d.upload).toHaveBeenCalledTimes(1);
    expect(d.trash).toHaveBeenCalledExactlyOnceWith("T1", "current");
  });

  it("going back to an earlier image reuses that file and creates no duplicate", async () => {
    const d = deps({ found: { ok: true, files: [OLD_FILE], siblings: [{ id: "earlier", name: NAME, url: OTHER, parentId: FOLDER }] } });
    d.fetchBytes.mockImplementation(async (url) => (url === OLD ? OLD_BYTES : BYTES));
    expect(await run(d)).toEqual({ ...SAVED, url: OTHER });
    expect(d.upload).not.toHaveBeenCalled();
    expect(d.trash).toHaveBeenCalledExactlyOnceWith("T1", "old-id");
  });

  it("finds an identical file behind other same-name files", async () => {
    const siblings = [1, 2, 3].map((n) => ({ id: `s${n}`, name: NAME, url: `${OTHER}${n}`, parentId: FOLDER }));
    const d = deps({ found: { ok: true, files: [OLD_FILE], siblings } });
    d.fetchBytes.mockImplementation(async (url) => (url === `${OTHER}3` ? BYTES : new Uint8Array([9])));
    expect((await run(d)).url).toBe(`${OTHER}3`);
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("stops rather than risk a duplicate when too many same-name files cannot all be compared", async () => {
    const siblings = Array.from({ length: 9 }, (_, n) => ({ id: `s${n}`, name: NAME, url: `${OTHER}${n}`, parentId: FOLDER }));
    const d = deps({ found: { ok: true, files: [OLD_FILE], siblings } });
    expect(await run(d)).toEqual({ status: "ambiguous" });
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("the same image as the current file changes nothing and removes nothing", async () => {
    const d = deps();
    d.fetchBytes.mockResolvedValue(BYTES);
    expect(await run(d)).toEqual({ status: "saved", url: OLD, oldFile: "same" });
    expect(d.upload).not.toHaveBeenCalled();
    expect(d.update).not.toHaveBeenCalled();
    expect(d.trash).not.toHaveBeenCalled();
  });

  it("re-selecting the current image with an identical same-name copy in the folder changes nothing", async () => {
    const copy = { id: "copy", name: NAME, url: OTHER, parentId: FOLDER };
    const d = deps({ found: { ok: true, files: [OLD_FILE], siblings: [copy] } });
    d.fetchBytes.mockResolvedValue(BYTES);
    expect(await run(d)).toEqual({ status: "saved", url: OLD, oldFile: "same" });
    expect(d.upload).not.toHaveBeenCalled();
    expect(d.update).not.toHaveBeenCalled();
    expect(d.trash).not.toHaveBeenCalled();
  });

  it("after no answer, a same-name file that was already there is not taken for the upload", async () => {
    const before = { id: "earlier", name: NAME, url: OTHER, parentId: FOLDER };
    const list: MediaFind = { ok: true, files: [OLD_FILE], siblings: [before] };
    const d = deps({ uploaded: { kind: "no_answer" }, found: [list, list] });
    d.fetchBytes.mockImplementation(async (url) => (url === OTHER ? new Uint8Array([9]) : OLD_BYTES));
    expect(await run(d)).toEqual({ status: "unknown" });
    expect(d.upload).toHaveBeenCalledTimes(1);
    expect(d.trash).not.toHaveBeenCalled();
  });
});

describe("replaceImage: tenant isolation", () => {
  it("uses only the given tenant for every call", async () => {
    const d = deps();
    await run(d, { tenantId: "T2" });
    for (const mock of [d.claim, d.read, d.find, d.upload, d.update, d.verify, d.trash]) {
      for (const call of mock.mock.calls as unknown[][]) expect(call[0]).toBe("T2");
    }
    expect(d.begin.mock.calls.every(([audit]) => audit.tenantId === "T2")).toBe(true);
  });
});
