import { describe, expect, it, vi } from "vitest";
import { allowedLogoHosts, fetchLogoDataUri, isAllowedLogoUrl } from "@/features/brand";

const HOSTS = ["assets.example.test"];
const png = new Uint8Array([137, 80, 78, 71]);
const ok = (body: BodyInit | null = png as unknown as BodyInit, type = "image/png", init: ResponseInit = {}) =>
  new Response(body, { status: 200, headers: { "content-type": type }, ...init });
const call = (url: string, f: typeof fetch, extra: Record<string, unknown> = {}) => fetchLogoDataUri(url, { hosts: HOSTS, fetch: f, ...extra });

describe("isAllowedLogoUrl", () => {
  it.each([
    ["https://assets.example.test/a.svg", true],
    ["https://ASSETS.example.test/a.svg", true],
    ["http://assets.example.test/a.svg", false],
    ["https://evil.example.test/a.svg", false],
    ["https://assets.example.test.evil.test/a.svg", false],
    ["https://sub.assets.example.test/a.svg", false],
    ["https://user:pw@assets.example.test/a.svg", false],
    ["https://assets.example.test:8443/a.svg", false],
    ["https://127.0.0.1/a.svg", false],
    ["https://localhost/a.svg", false],
    ["javascript:alert(1)", false],
    ["not a url", false],
  ])("%s -> %s", (url, expected) => {
    expect(isAllowedLogoUrl(url, HOSTS)).toBe(expected);
  });
});

describe("fetchLogoDataUri", () => {
  it("returns a data URI for an allowed host and an image type", async () => {
    expect(await call("https://assets.example.test/l.png", (async () => ok()) as unknown as typeof fetch)).toBe("data:image/png;base64,iVBORw==");
  });

  it("does not even call fetch for a host that is not allowed", async () => {
    const f = vi.fn();
    expect(await call("https://evil.example.test/l.png", f as unknown as typeof fetch)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("asks for no redirect following and never follows one (a 3xx gives null)", async () => {
    const f = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://127.0.0.1/x" } }));
    expect(await call("https://assets.example.test/l.png", f as unknown as typeof fetch)).toBeNull();
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].redirect).toBe("manual");
  });

  it.each([["text/html"], ["application/json"], [""], ["image/x-icon"]])("refuses the content type %j", async (type) => {
    expect(await call("https://assets.example.test/l", (async () => ok(png as unknown as BodyInit, type)) as unknown as typeof fetch)).toBeNull();
  });

  it("refuses a body over the cap, by header and by streaming", async () => {
    expect(await call("https://assets.example.test/l", (async () => ok(png as unknown as BodyInit, "image/png", { headers: { "content-type": "image/png", "content-length": "999999" } })) as unknown as typeof fetch, { maxBytes: 100 })).toBeNull();
    const big = new Uint8Array(500);
    expect(await call("https://assets.example.test/l", (async () => ok(big as unknown as BodyInit)) as unknown as typeof fetch, { maxBytes: 100 })).toBeNull();
  });

  it("gives null for an empty body, a 404 and a network error", async () => {
    expect(await call("https://assets.example.test/l", (async () => ok(new Uint8Array(0) as unknown as BodyInit)) as unknown as typeof fetch)).toBeNull();
    expect(await call("https://assets.example.test/l", (async () => new Response("x", { status: 404 })) as unknown as typeof fetch)).toBeNull();
    expect(await call("https://assets.example.test/l", (async () => { throw new Error("down"); }) as unknown as typeof fetch)).toBeNull();
  });

  it("gives null when the host is too slow (the request is aborted)", async () => {
    const slow = ((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
    expect(await call("https://assets.example.test/l", slow, { timeoutMs: 20 })).toBeNull();
  });
});

describe("allowedLogoHosts", () => {
  it("has HighLevel's media host by default and adds only well-formed hosts from the variable", () => {
    expect(allowedLogoHosts("")).toEqual(["assets.cdn.filesafe.space"]);
    expect(allowedLogoHosts("cdn.one.test, bad host!, CDN.two.test")).toEqual(["assets.cdn.filesafe.space", "cdn.one.test", "cdn.two.test"]);
  });
});
