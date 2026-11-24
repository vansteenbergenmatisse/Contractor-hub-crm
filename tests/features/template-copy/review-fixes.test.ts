import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomValueDetail, MediaLibrary } from "@/features/highlevel";
import {
  applyTemplateCopy,
  BATCH_BUDGET_MS,
  compressToWebp,
  createImageCopier,
  handleTemplateCopy,
  previewTemplateCopy,
  templateDigest,
  type CopyDeps,
  type ImageCopyDeps,
} from "@/features/template-copy";

// Review round 1 of feat/template-copy: secret overwrites, template drift, the time budget, the 429
// resend, a failed template library, non-image media and animated GIFs.
const row = (key: string, value: string): CustomValueDetail => ({ id: `id-${key}`, key, name: key, value });
const tok = (key: string, value: string) => `tok:${key}:${value.trim()}`;
const digest = (rows: readonly { key: string; value: string }[]) => templateDigest("s", rows);

function setup(templateRows: CustomValueDetail[], targetRows: CustomValueDetail[], over: Partial<CopyDeps> = {}) {
  const template = new Map(templateRows.map((r) => [r.key, { ...r }]));
  const target = new Map(targetRows.map((r) => [r.key, { ...r }]));
  const audits: { row: Record<string, string>; outcome?: string }[] = [];
  let clock = 0;
  const deps: CopyDeps = {
    readTemplate: vi.fn(async () => ({ ok: true as const, values: [...template.values()].map((r) => ({ ...r })) })),
    readTarget: vi.fn(async () => ({ ok: true as const, values: [...target.values()].map((r) => ({ ...r })) })),
    update: vi.fn(async (r: CustomValueDetail, value: string) => {
      const current = target.get(r.key);
      if (current) current.value = value;
      return "saved" as const;
    }),
    begin: vi.fn(async (row) => {
      audits.push({ row });
      return String(audits.length - 1);
    }),
    finish: vi.fn(async (id, outcome) => {
      audits[Number(id)].outcome = outcome;
    }),
    claim: vi.fn(async () => "holder"),
    release: vi.fn(async () => {}),
    invalidate: vi.fn(),
    copyImage: vi.fn(async () => ({ kind: "uploaded" as const, url: "https://files.leadconnectorhq.com/target-copy" })),
    tokenOf: tok,
    digestOf: digest,
    isImage: (v) => v.startsWith("https://files.leadconnectorhq.com/"),
    isSecret: (k) => k.startsWith("zz_"),
    now: () => clock,
    ...over,
  };
  return { deps, template, target, audits, tick: (ms: number) => (clock += ms), time: () => clock };
}

const input = (over: Partial<Parameters<typeof applyTemplateCopy>[0]> = {}) => ({ targetTenantId: "T2", actorId: "admin-1", overwrite: {}, skip: new Set<string>(), ...over });

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("applyTemplateCopy: secret-looking keys (M1)", () => {
  it("never replaces a filled secret-looking key, even when ticked with a valid token", async () => {
    const { deps, target, audits } = setup([row("zz_api_key", "jcr-key")], [row("zz_api_key", "client-key")]);
    const batch = await applyTemplateCopy(input({ overwrite: { zz_api_key: tok("zz_api_key", "client-key") } }), deps);
    expect(batch.status === "ok" && batch.results).toEqual([{ key: "zz_api_key", status: "secret_not_replaced" }]);
    expect(batch.status === "ok" && batch.done).toBe(true);
    expect(target.get("zz_api_key")?.value).toBe("client-key");
    expect(deps.update).not.toHaveBeenCalled();
    expect(audits).toEqual([]);
  });
});

describe("applyTemplateCopy: the template changed after the preview (M2)", () => {
  it("returns the template's digest with the preview", async () => {
    const { deps } = setup([row("a", "1"), row("b", "2")], [row("a", ""), row("b", "")]);
    const answer = await previewTemplateCopy(deps);
    expect(answer.status === "ok" && answer.preview.templateDigest).toBe(digest([row("a", "1"), row("b", "2")]));
  });

  it("writes nothing when the template's values differ from the ones the preview showed", async () => {
    const { deps, template, target } = setup([row("business_phone_number", "X")], [row("business_phone_number", "")]);
    const answer = await previewTemplateCopy(deps);
    const shown = answer.status === "ok" ? answer.preview.templateDigest : undefined;
    template.get("business_phone_number")!.value = "Y";
    expect(await applyTemplateCopy(input({ templateDigest: shown }), deps)).toEqual({ status: "template_changed" });
    expect(deps.update).not.toHaveBeenCalled();
    expect(target.get("business_phone_number")?.value).toBe("");
    expect(deps.release).toHaveBeenCalledWith("holder");
  });

  it("writes when the template still matches the preview", async () => {
    const { deps } = setup([row("a", "1")], [row("a", "")]);
    const answer = await previewTemplateCopy(deps);
    const shown = answer.status === "ok" ? answer.preview.templateDigest : undefined;
    const batch = await applyTemplateCopy(input({ templateDigest: shown }), deps);
    expect(batch.status === "ok" && batch.results).toEqual([{ key: "a", status: "filled" }]);
  });

  it("is keyed, ignores row order and padding, and changes with any value", () => {
    const a = templateDigest("s", [row("a", "1"), row("b", "2")]);
    expect(templateDigest("s", [row("b", " 2 "), row("a", "1")])).toBe(a);
    expect(templateDigest("s", [row("a", "1"), row("b", "3")])).not.toBe(a);
    expect(templateDigest("other", [row("a", "1"), row("b", "2")])).not.toBe(a);
    expect(a).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });
});

describe("applyTemplateCopy: the time budget inside a group (M3)", () => {
  it("stops starting images well before the route's 60 seconds when each image costs 15 seconds", async () => {
    const keys = ["img1", "img2", "img3", "img4", "img5", "img6"];
    const s = setup(
      keys.map((k) => row(k, `https://files.leadconnectorhq.com/${k}`)),
      keys.map((k) => row(k, "")),
    );
    s.deps.copyImage = vi.fn(async () => {
      s.tick(15_000);
      return { kind: "uploaded" as const, url: "https://files.leadconnectorhq.com/copy" };
    });
    const batch = await applyTemplateCopy(input(), s.deps);
    expect(batch.status === "ok" && batch.remaining).toBeGreaterThan(0);
    expect(s.time()).toBeLessThan(45_000);
    // Every audit row that was started got its outcome.
    expect(s.audits.every((a) => a.outcome !== undefined)).toBe(true);
  });

  it("checks the budget before each key, not only at the start of a group", async () => {
    const s = setup([row("a", "1"), row("b", "2"), row("c", "3")], [row("a", ""), row("b", ""), row("c", "")]);
    s.deps.update = vi.fn(async () => {
      s.tick(BATCH_BUDGET_MS + 1);
      return "saved" as const;
    });
    const batch = await applyTemplateCopy(input(), s.deps);
    expect(s.deps.update).toHaveBeenCalledTimes(1);
    expect(batch.status === "ok" && batch.remaining).toBe(2);
  });

  it("gives up on an image that does not finish by its deadline and reports it", async () => {
    const s = setup([row("logo", "https://files.leadconnectorhq.com/logo")], [row("logo", "")], {
      copyImage: vi.fn(() => new Promise<never>(() => {})),
      wait: vi.fn(async () => {}),
    });
    const batch = await applyTemplateCopy(input(), s.deps);
    expect(batch.status === "ok" && batch.results).toEqual([{ key: "logo", status: "image_failed" }]);
    expect(s.deps.update).not.toHaveBeenCalled();
  });
});

describe("applyTemplateCopy: the 429 resend (L3)", () => {
  it("does not resend a write whose own answer was not a 429", async () => {
    let limited = 0;
    let seen = 0;
    const s = setup([row("a", "1")], [row("a", "")], {
      update: vi.fn(async () => "retry" as const),
      wasLimited: () => {
        const fresh = limited > seen;
        seen = limited;
        return fresh;
      },
    });
    const realRead = s.deps.readTarget;
    s.deps.readTarget = vi.fn(async () => {
      // A 429 on the read before the write.
      limited += 1;
      return realRead();
    });
    await applyTemplateCopy(input(), s.deps);
    expect(s.deps.update).toHaveBeenCalledTimes(1);
  });
});

const URL_T = "https://files.leadconnectorhq.com/jcr/logo-file";
const png = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "#336699" } }).png().toBuffer().then((b) => new Uint8Array(b));

function imageDeps(over: Partial<ImageCopyDeps> = {}) {
  const templateLib: MediaLibrary = {
    ok: true,
    folders: [{ id: "tf1", name: "Brand", parentId: null }],
    files: [
      { id: "t1", name: "logo.png", url: URL_T, parentId: "tf1" },
      { id: "t2", name: "intro.mp4", url: "https://files.leadconnectorhq.com/jcr/intro-file", parentId: "tf1" },
    ],
  };
  const targetLib: MediaLibrary = { ok: true, folders: [{ id: "gf1", name: "Brand", parentId: null }], files: [] };
  const d: ImageCopyDeps = {
    templateLibrary: vi.fn(async () => templateLib),
    targetLibrary: vi.fn(async () => targetLib),
    createFolder: vi.fn(async () => ({ kind: "created" as const, id: "gf2" })),
    upload: vi.fn(async () => ({ kind: "uploaded" as const, fileId: "nf", url: "https://files.leadconnectorhq.com/client/new" })),
    fetchBytes: vi.fn(async () => png(10, 10)),
    compress: compressToWebp,
    checkSvg: (bytes) => ({ ok: true, bytes }),
    isAllowedHost: (url) => url.startsWith("https://files.leadconnectorhq.com/"),
    ...over,
  };
  return d;
}

describe("createImageCopier: review fixes", () => {
  it("uploads nothing when the template's library cannot be read whole, instead of losing the folder path (#5)", async () => {
    for (const reason of ["incomplete", "retry", "connection"] as const) {
      const d = imageDeps({ templateLibrary: vi.fn(async () => ({ ok: false as const, reason })) });
      expect(await createImageCopier(d)(URL_T)).toEqual({ kind: "image_failed" });
      expect(d.upload).not.toHaveBeenCalled();
    }
    const denied = imageDeps({ templateLibrary: vi.fn(async () => ({ ok: false as const, reason: "permission" as const })) });
    expect(await createImageCopier(denied)(URL_T)).toEqual({ kind: "needs_media_permission" });
    expect(denied.upload).not.toHaveBeenCalled();
  });

  it("copies a video from the template's library as it is, into the same folder (#4)", async () => {
    const video = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50]);
    const d = imageDeps({ fetchBytes: vi.fn(async () => video) });
    expect(await createImageCopier(d)("https://files.leadconnectorhq.com/jcr/intro-file")).toEqual({ kind: "uploaded", url: "https://files.leadconnectorhq.com/client/new" });
    expect(vi.mocked(d.upload).mock.calls[0][0]).toMatchObject({ name: "intro.mp4", fileName: "intro.mp4", contentType: "video/mp4", parentId: "gf1", bytes: video });
  });

  it("still refuses an unknown non-image file", async () => {
    const d = imageDeps({ fetchBytes: vi.fn(async () => new TextEncoder().encode("not an image")) });
    expect(await createImageCopier(d)(URL_T)).toEqual({ kind: "not_an_image" });
    expect(d.upload).not.toHaveBeenCalled();
  });
});

describe("compressToWebp: animated GIF (#4)", () => {
  it("keeps every frame of an animated GIF", async () => {
    const frames = Buffer.alloc(10 * 20 * 3, 0);
    frames.fill(255, 10 * 10 * 3);
    // Two 10x10 frames, one black and one white.
    const animated = await sharp(frames, { raw: { width: 10, height: 20, channels: 3, pageHeight: 10 } }).gif().toBuffer();
    expect((await sharp(animated, { animated: true }).metadata()).pages).toBe(2);
    const out = await compressToWebp(new Uint8Array(animated));
    expect(out).not.toBeNull();
    const meta = await sharp(Buffer.from(out!.bytes), { animated: true }).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.pages).toBe(2);
    expect(out!.height).toBe(10);
  });
});

describe("POST copy-template: the template digest (M2)", () => {
  const ORIGIN = "https://app.example.test";
  const routeDeps = () => ({
    adminId: vi.fn(async () => "admin-1"),
    isViewing: vi.fn(async () => false),
    limiter: vi.fn(async () => true),
    appOrigin: ORIGIN,
    config: { enabled: true, templateTenantId: "TPL" },
    preview: vi.fn(),
    apply: vi.fn(async () => ({ status: "template_changed" as const })),
  });
  const post = (body: unknown) =>
    new Request(`${ORIGIN}/api/admin/clients/T2/copy-template`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify(body) });

  it("passes the digest to apply and answers 409 template_changed", async () => {
    const d = routeDeps();
    const response = await handleTemplateCopy(post({ action: "apply", templateDigest: "abc_DEF-1" }), "T2", d);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "template_changed" });
    expect(d.apply).toHaveBeenCalledWith(expect.objectContaining({ templateDigest: "abc_DEF-1" }));
  });

  it("refuses a digest that is not a short token", async () => {
    for (const templateDigest of [5, "a b", "x".repeat(65)]) {
      const d = routeDeps();
      expect((await handleTemplateCopy(post({ action: "apply", templateDigest }), "T2", d)).status).toBe(400);
      expect(d.apply).not.toHaveBeenCalled();
    }
  });
});
