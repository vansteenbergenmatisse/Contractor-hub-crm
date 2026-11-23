import { describe, expect, it, vi } from "vitest";
import { createMediaAdapter, fetchMediaBytes, TokenServiceError, type MediaAdapterDeps } from "@/features/highlevel";

const HOST = "files.leadconnectorhq.com";
const file = { bytes: new Uint8Array([1, 2, 3]), name: "business_logo-abc", fileName: "business_logo-abc.svg", contentType: "image/svg+xml" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function adapter(over: Partial<MediaAdapterDeps> = {}) {
  const deps: MediaAdapterDeps = {
    readLocationId: vi.fn(async () => "loc-1"),
    getLocationToken: vi.fn(async () => "token-1"),
    requestFiles: vi.fn(async () => json({ files: [] })),
    requestUpload: vi.fn(async () => json({ fileId: "f1", url: `https://${HOST}/a/b` })),
    requestTrash: vi.fn(async () => json([{ deleted: true, id: "f1" }])),
    ...over,
  };
  return { media: createMediaAdapter(deps), deps };
}

describe("media adapter: find", () => {
  const URL_A = `https://${HOST}/a`;
  const own = (over: Record<string, unknown>) => ({ altId: "loc-1", altType: "location", ...over });
  // A library by folder and type, with real paging.
  const library = (tree: Record<string, { file?: unknown[]; folder?: unknown[] }>) =>
    vi.fn<MediaAdapterDeps["requestFiles"]>(async (_token, _location, page) => {
      const rows = tree[page.parentId ?? "root"]?.[page.type] ?? [];
      return json({ files: rows.slice(page.offset, page.offset + page.limit) });
    });

  it("finds the exact URL in a nested folder with its id, name and parent", async () => {
    const requestFiles = library({
      root: { folder: [own({ _id: "d1", type: "folder", name: "Logos" })] },
      d1: { file: [own({ _id: "f9", name: "Logo.PNG", url: URL_A, parentId: "d1" }), own({ _id: "f8", name: "Logo.PNG", url: `${URL_A}2`, parentId: "d1" })] },
    });
    const { media } = adapter({ requestFiles });
    expect(await media.find("t1", URL_A)).toEqual({
      ok: true,
      files: [{ id: "f9", name: "Logo.PNG", url: URL_A, parentId: "d1" }],
      siblings: [{ id: "f8", name: "Logo.PNG", url: `${URL_A}2`, parentId: "d1" }],
    });
  });

  it("matches the URL exactly, never by a prefix, other case or query", async () => {
    const requestFiles = library({ root: { file: [own({ _id: "f1", name: "a", url: `${URL_A}?v=1` }), own({ _id: "f2", name: "a", url: URL_A.toUpperCase() }), own({ _id: "f3", name: "a", url: `${URL_A}/b` })] } });
    expect(await adapter({ requestFiles }).media.find("t1", URL_A)).toEqual({ ok: true, files: [], siblings: [] });
  });

  it("reports every file holding the URL, so duplicates are never guessed", async () => {
    const requestFiles = library({ root: { file: [own({ _id: "f1", name: "a", url: URL_A }), own({ _id: "f2", name: "b", url: URL_A })] } });
    const result = await adapter({ requestFiles }).media.find("t1", URL_A);
    expect(result.ok && result.files.map((row) => row.id)).toEqual(["f1", "f2"]);
  });

  it("leaves out trashed rows and does not treat a folder as a file", async () => {
    const requestFiles = library({ root: { file: [
      own({ _id: "t", name: "a", url: URL_A, status: "trashed" }),
      own({ _id: "d", name: "a", url: URL_A, deleted: true }),
      own({ _id: "fo", name: "a", url: URL_A, type: "folder" }),
    ] } });
    expect(await adapter({ requestFiles }).media.find("t1", URL_A)).toEqual({ ok: true, files: [], siblings: [] });
  });

  it.each([
    ["another location", { _id: "x", name: "a", url: URL_A, altId: "loc-2", altType: "location" }],
    ["no location", { _id: "y", name: "a", url: URL_A }],
    ["a folder without a location", { _id: "z", type: "folder", name: "hidden" }],
    ["no id", own({ name: "a", url: URL_A })],
    ["a file without a url", own({ _id: "n", name: "a" })],
    ["a row that is not an object", "junk"],
  ])("calls the library incomplete on a row with %s", async (_name, bad) => {
    const requestFiles = library({ root: { file: [own({ _id: "f1", name: "a", url: URL_A }), bad] } });
    expect(await adapter({ requestFiles }).media.find("t1", URL_A)).toEqual({ ok: false, reason: "incomplete" });
  });

  it("reads every page of a folder", async () => {
    const rows = Array.from({ length: 150 }, (_, i) => own({ _id: `f${i}`, name: `n${i}`, url: i === 149 ? URL_A : `${URL_A}-${i}` }));
    const result = await adapter({ requestFiles: library({ root: { file: rows } }) }).media.find("t1", URL_A);
    expect(result.ok && result.files[0]?.id).toBe("f149");
  });

  it("keeps reading when the server caps a page below the asked limit", async () => {
    const rows = Array.from({ length: 130 }, (_, i) => own({ _id: `f${i}`, name: `n${i}`, url: i === 129 ? URL_A : `${URL_A}-${i}` }));
    const requestFiles = vi.fn<MediaAdapterDeps["requestFiles"]>(async (_t, _l, page) => json({ files: page.type === "file" ? rows.slice(page.offset, page.offset + 50) : [] }));
    const result = await adapter({ requestFiles }).media.find("t1", URL_A);
    expect(result.ok && result.files[0]?.id).toBe("f129");
    expect(requestFiles.mock.calls.filter(([, , page]) => page.type === "file").map(([, , page]) => page.offset)).toEqual([0, 50, 100, 130]);
  });

  it("does not call a page of only trashed rows a repeat", async () => {
    const rows = [...Array.from({ length: 3 }, (_, i) => own({ _id: `t${i}`, name: "x", url: `${URL_A}-${i}`, status: "trashed" })), own({ _id: "f1", name: "a", url: URL_A })];
    const requestFiles = vi.fn<MediaAdapterDeps["requestFiles"]>(async (_t, _l, page) => json({ files: page.type === "file" ? rows.slice(page.offset, page.offset + 3) : [] }));
    const result = await adapter({ requestFiles }).media.find("t1", URL_A);
    expect(result.ok && result.files[0]?.id).toBe("f1");
  });

  it("stops as incomplete when paging repeats the same page", async () => {
    const rows = Array.from({ length: 100 }, (_, i) => own({ _id: `f${i}`, name: "n", url: `${URL_A}-${i}` }));
    const requestFiles = vi.fn<MediaAdapterDeps["requestFiles"]>(async () => json({ files: rows }));
    expect(await adapter({ requestFiles }).media.find("t1", URL_A)).toEqual({ ok: false, reason: "incomplete" });
  });

  it("stops as incomplete past the call cap instead of answering from part of the library", async () => {
    const folders = Array.from({ length: 80 }, (_, i) => own({ _id: `d${i}`, type: "folder", name: `d${i}` }));
    const requestFiles = library({ root: { folder: folders } });
    expect(await adapter({ requestFiles }).media.find("t1", URL_A)).toEqual({ ok: false, reason: "incomplete" });
    expect(requestFiles.mock.calls.length).toBeLessThanOrEqual(120);
  });

  it("does not loop on a folder that lists itself", async () => {
    const requestFiles = library({ root: { folder: [own({ _id: "d1", type: "folder", name: "d" })] }, d1: { folder: [own({ _id: "d1", type: "folder", name: "d" })] } });
    expect(await adapter({ requestFiles }).media.find("t1", URL_A)).toEqual({ ok: true, files: [], siblings: [] });
  });

  it("verifies only the same id, URL, name and folder", async () => {
    const entry = { id: "f1", name: "a.png", url: URL_A, parentId: "d1" };
    const listed = (over: Record<string, unknown>) => adapter({ requestFiles: library({ d1: { file: [own({ _id: "f1", name: "a.png", url: URL_A, parentId: "d1", ...over })] } }) }).media.verify("t1", entry);
    expect(await listed({})).toBe(true);
    expect(await listed({ url: `${URL_A}x` })).toBe(false);
    expect(await listed({ name: "b.png" })).toBe(false);
    expect(await listed({ parentId: "d2" })).toBe(false);
    expect(await listed({ type: "folder" })).toBe(false);
    expect(await listed({ status: "trashed" })).toBe(false);
  });

  it("does not verify past a row it cannot read", async () => {
    const entry = { id: "f1", name: "a", url: URL_A, parentId: null };
    const requestFiles = library({ root: { file: ["junk", own({ _id: "f1", name: "a", url: URL_A })] } });
    expect(await adapter({ requestFiles }).media.verify("t1", entry)).toBe(false);
  });

  it("finds a file past a server page cap when verifying", async () => {
    const rows = Array.from({ length: 70 }, (_, i) => own({ _id: `f${i}`, name: "a", url: `${URL_A}-${i}` }));
    const requestFiles = vi.fn<MediaAdapterDeps["requestFiles"]>(async (_t, _l, page) => json({ files: rows.slice(page.offset, page.offset + 50) }));
    expect(await adapter({ requestFiles }).media.verify("t1", { id: "f69", name: "a", url: `${URL_A}-69`, parentId: null })).toBe(true);
  });

  it("stops verifying when its time is spent", async () => {
    const rows = Array.from({ length: 500 }, (_, i) => own({ _id: `f${i}`, name: "a", url: `${URL_A}-${i}` }));
    let clock = 0;
    const requestFiles = vi.fn<MediaAdapterDeps["requestFiles"]>(async (_t, _l, page) => {
      clock += 3_000;
      return json({ files: rows.slice(page.offset, page.offset + 50) });
    });
    expect(await adapter({ requestFiles, now: () => clock }).media.verify("t1", { id: "f499", name: "a", url: `${URL_A}-499`, parentId: null })).toBe(false);
    expect(requestFiles.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("trashes one id with the recoverable status", async () => {
    const { media, deps } = adapter();
    expect(await media.trash("t1", "f1")).toBe("trashed");
    expect(deps.requestTrash).toHaveBeenCalledExactlyOnceWith("token-1", "loc-1", "f1");
  });

  it.each([
    [401, "permission"], [403, "permission"], [404, "failed"], [422, "failed"], [500, "unconfirmed"], [408, "unconfirmed"],
  ] as const)("maps a trash status %s to %s, in one attempt", async (status, outcome) => {
    const { media, deps } = adapter({ requestTrash: vi.fn(async () => json({}, status)) });
    expect(await media.trash("t1", "f1")).toBe(outcome);
    expect(deps.requestTrash).toHaveBeenCalledTimes(1);
  });

  it("does not call a 2xx that names another id trashed", async () => {
    const { media } = adapter({ requestTrash: vi.fn(async () => json([{ deleted: true, id: "other" }])) });
    expect(await media.trash("t1", "f1")).toBe("unconfirmed");
  });

  it.each([[401], [403]])("reports a %s as a missing grant", async (status) => {
    const { media } = adapter({ requestFiles: vi.fn(async () => json({}, status)) });
    expect(await media.find("t1", "n")).toEqual({ ok: false, reason: "permission" });
  });

  it.each([[429], [500]])("reports a %s as try again", async (status) => {
    const { media } = adapter({ requestFiles: vi.fn(async () => json({}, status)) });
    expect(await media.find("t1", "n")).toEqual({ ok: false, reason: "retry" });
  });

  it("reports a malformed body as try again", async () => {
    const { media } = adapter({ requestFiles: vi.fn(async () => new Response("<html>", { status: 200 })) });
    expect(await media.find("t1", "n")).toEqual({ ok: false, reason: "retry" });
  });

  it("reports a location without a connection", async () => {
    const { media } = adapter({ readLocationId: vi.fn(async () => null) });
    expect(await media.find("t1", "n")).toEqual({ ok: false, reason: "connection" });
  });

  it("separates a broken connection from a missing grant", async () => {
    const { media } = adapter({ getLocationToken: vi.fn(async () => { throw new TokenServiceError("needs_reconnect"); }) });
    expect(await media.find("t1", "n")).toEqual({ ok: false, reason: "connection" });
  });
});

describe("media adapter: upload", () => {
  it("returns the file id and url", async () => {
    const { media, deps } = adapter();
    expect(await media.upload("t1", file)).toEqual({ kind: "uploaded", fileId: "f1", url: `https://${HOST}/a/b` });
    expect(deps.requestUpload).toHaveBeenCalledTimes(1);
  });

  it.each([
    [400, "rejected"], [413, "rejected"], [415, "rejected"], [422, "rejected"],
    [401, "permission"], [403, "permission"],
    [429, "retry"],
    [408, "no_answer"], [500, "no_answer"], [502, "no_answer"], [503, "no_answer"],
  ])("maps %s to %s and makes one attempt", async (status, kind) => {
    const { media, deps } = adapter({ requestUpload: vi.fn(async () => json({}, status)) });
    expect(await media.upload("t1", file)).toEqual({ kind });
    expect(deps.requestUpload).toHaveBeenCalledTimes(1);
  });

  it("treats a timeout as no answer", async () => {
    const { media, deps } = adapter({ requestUpload: vi.fn(async () => { throw new Error("timeout"); }) });
    expect(await media.upload("t1", file)).toEqual({ kind: "no_answer" });
    expect(deps.requestUpload).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["not JSON", new Response("nope", { status: 200 })],
    ["no url", json({ fileId: "f1" })],
    ["no file id", json({ url: `https://${HOST}/a` })],
    ["a url that is not text", json({ fileId: "f1", url: 7 })],
  ])("treats a 2xx with %s as no answer, because the file may exist", async (_name, response) => {
    const { media } = adapter({ requestUpload: vi.fn(async () => response) });
    expect(await media.upload("t1", file)).toEqual({ kind: "no_answer" });
  });

  it("does not send when the token fails", async () => {
    const { media, deps } = adapter({ getLocationToken: vi.fn(async () => { throw new TokenServiceError("unavailable"); }) });
    expect(await media.upload("t1", file)).toEqual({ kind: "retry" });
    expect(deps.requestUpload).not.toHaveBeenCalled();
  });

  it("offers no permanent delete or rename", () => {
    const { media } = adapter();
    expect(Object.keys(media).sort()).toEqual(["find", "trash", "upload", "verify"]);
  });
});

describe("fetchMediaBytes", () => {
  const call = (url: string, f: typeof fetch, maxBytes = 16) => fetchMediaBytes(url, [HOST], { fetch: f, maxBytes });

  it("returns the bytes from an allowed host without following a redirect", async () => {
    const f = vi.fn(async () => new Response(new Uint8Array([1, 2]))) as unknown as typeof fetch;
    expect(await call(`https://${HOST}/a`, f)).toEqual(new Uint8Array([1, 2]));
    expect((f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1].redirect).toBe("manual");
  });

  it.each(["http://files.leadconnectorhq.com/a", "https://evil.test/a", "https://u:p@files.leadconnectorhq.com/a", "https://files.leadconnectorhq.com:8443/a", "https://files.leadconnectorhq.com.evil.test/a"])("never calls %s", async (url) => {
    const f = vi.fn() as unknown as typeof fetch;
    expect(await call(url, f)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it.each([302, 404, 500])("gives null for a %s", async (status) => {
    const f = (async () => new Response(status === 302 ? null : "x", { status })) as unknown as typeof fetch;
    expect(await call(`https://${HOST}/a`, f)).toBeNull();
  });

  it("stops at the size cap", async () => {
    const f = (async () => new Response(new Uint8Array(17))) as unknown as typeof fetch;
    expect(await call(`https://${HOST}/a`, f)).toBeNull();
  });

  it("gives null when the call fails", async () => {
    const f = (async () => { throw new Error("down"); }) as unknown as typeof fetch;
    expect(await call(`https://${HOST}/a`, f)).toBeNull();
  });
});
