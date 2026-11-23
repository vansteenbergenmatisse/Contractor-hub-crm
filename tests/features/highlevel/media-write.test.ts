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
    ...over,
  };
  return { media: createMediaAdapter(deps), deps };
}

describe("media adapter: find", () => {
  it("returns only exact names of this location", async () => {
    const { media, deps } = adapter({
      requestFiles: vi.fn(async () => json({ files: [
        { name: "business_logo-abc", url: `https://${HOST}/1`, altId: "loc-1", altType: "location" },
        { name: "business_logo-abc", url: `https://${HOST}/other`, altId: "loc-2", altType: "location" },
        { name: "business_logo-abcd", url: `https://${HOST}/2`, altId: "loc-1" },
        { name: "business_logo-abc" },
        "junk",
      ] })),
    });
    expect(await media.find("t1", "business_logo-abc")).toEqual({ ok: true, files: [{ name: "business_logo-abc", url: `https://${HOST}/1` }] });
    expect(deps.requestFiles).toHaveBeenCalledWith("token-1", "loc-1", "business_logo-abc");
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

  it("offers no delete or rename", () => {
    const { media } = adapter();
    expect(Object.keys(media).sort()).toEqual(["find", "upload"]);
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
