import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomValueDetail, MediaFind, MediaUploadOutcome } from "@/features/highlevel";
import { replaceImage, type MediaDeps } from "@/features/settings-write-back";

// Mocked HighLevel and database only. All values are fake.
const KEY = "1_our_work_after";
const OLD = "https://assets.cdn.filesafe.space/x/old.webp";
const NEW = "https://files.leadconnectorhq.com/x/new";
const BYTES = new Uint8Array([1, 2, 3, 4]);
const HASH = createHash("sha256").update(BYTES).digest("hex");
const NAME = `${KEY}-${HASH.slice(0, 12)}`;
const FILE = { bytes: BYTES, contentType: "image/webp", extension: "webp", hash: HASH };
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
      if (founds) return founds.shift() ?? { ok: true, files: [] };
      return (options.found as MediaFind | undefined) ?? { ok: true, files: [] };
    }),
    upload: vi.fn<MediaDeps["upload"]>(async () => {
      calls.push("upload");
      return options.uploaded ?? { kind: "uploaded", fileId: "f1", url: NEW };
    }),
    fetchBytes: vi.fn<MediaDeps["fetchBytes"]>(async () => (options.fetched === undefined ? BYTES : options.fetched)),
    hosts: ["assets.cdn.filesafe.space", "files.leadconnectorhq.com"],
  };
  return d;
}
const run = (d: MediaDeps, over: Partial<{ tenantId: string; expected: string }> = {}) =>
  replaceImage({ tenantId: "T1", actorId: "U1", key: KEY, expected: OLD, file: FILE, ...over }, d);
const hit = (url = NEW): MediaFind => ({ ok: true, files: [{ name: NAME, url }] });

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("replaceImage: the good path", () => {
  it("looks up, audits, uploads a new file, then points the value at it and confirms", async () => {
    const d = deps();
    expect(await run(d)).toEqual({ status: "saved", url: NEW });
    expect(d.calls).toEqual(["find", "audit", "upload", "audit", "put"]);
    expect(d.store.get(KEY)?.value).toBe(NEW);
    expect(d.upload).toHaveBeenCalledWith("T1", expect.objectContaining({ name: NAME, fileName: `${NAME}.webp`, contentType: "image/webp" }));
    expect(d.begin.mock.calls[0][0]).toMatchObject({ tenantId: "T1", actorId: "U1", key: KEY, previousValue: OLD, newValue: `upload:${NAME}` });
    expect(d.begin.mock.calls[1][0]).toMatchObject({ key: KEY, previousValue: OLD, newValue: NEW });
    expect(d.release).toHaveBeenCalledWith("T1", "holder");
  });

  it("reuses a file already there after checking its real bytes, with no second upload", async () => {
    const d = deps({ found: hit() });
    expect(await run(d)).toEqual({ status: "saved", url: NEW });
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
  it("stops on a hash mismatch and keeps the old value", async () => {
    const d = deps({ found: hit(), fetched: new Uint8Array([9, 9, 9, 9]) });
    expect(await run(d)).toEqual({ status: "hash_mismatch" });
    expect(d.upload).not.toHaveBeenCalled();
    expect(d.update).not.toHaveBeenCalled();
    expect(d.store.get(KEY)?.value).toBe(OLD);
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
    const d = deps({ uploaded: { kind: "no_answer" }, found: [{ ok: true, files: [] }, hit()] });
    expect(await run(d)).toEqual({ status: "saved", url: NEW });
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
    const d = deps({ uploaded: { kind: "no_answer" }, found: [{ ok: true, files: [] }, { ok: false, reason: "retry" }] });
    expect(await run(d)).toEqual({ status: "unknown" });
    expect(d.upload).toHaveBeenCalledTimes(1);
  });

  it("stops on a hash mismatch found by the re-read", async () => {
    const d = deps({ uploaded: { kind: "no_answer" }, found: [{ ok: true, files: [] }, hit()], fetched: new Uint8Array([7, 7, 7, 7]) });
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
    expect(await run(d)).toEqual({ status: "saved", url: NEW });
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

describe("replaceImage: tenant isolation", () => {
  it("uses only the given tenant for every call", async () => {
    const d = deps();
    await run(d, { tenantId: "T2" });
    for (const mock of [d.claim, d.read, d.find, d.upload, d.update]) {
      for (const call of mock.mock.calls as unknown[][]) expect(call[0]).toBe("T2");
    }
    expect(d.begin.mock.calls.every(([audit]) => audit.tenantId === "T2")).toBe(true);
  });
});
