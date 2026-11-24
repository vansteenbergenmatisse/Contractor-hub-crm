import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomValueDetail } from "@/features/highlevel";
import { applyTemplateCopy, MAX_WRITES_PER_BATCH, previewTemplateCopy, type CopyDeps } from "@/features/template-copy";

const row = (key: string, value: string): CustomValueDetail => ({ id: `id-${key}`, key, name: key, value });
const tok = (key: string, value: string) => `tok:${key}:${value.trim()}`;

// A fake target location: reads return its current rows, updates change them.
function setup(templateRows: CustomValueDetail[], targetRows: CustomValueDetail[], over: Partial<CopyDeps> = {}) {
  const target = new Map(targetRows.map((r) => [r.key, { ...r }]));
  const audits: { row: Record<string, string>; outcome?: string }[] = [];
  const deps: CopyDeps = {
    readTemplate: vi.fn(async () => ({ ok: true as const, values: templateRows })),
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
    isImage: (v) => v.startsWith("https://files.leadconnectorhq.com/"),
    isSecret: (k) => k.startsWith("zz_"),
    now: () => 0,
    ...over,
  };
  return { deps, target, audits };
}

const input = (over: Partial<Parameters<typeof applyTemplateCopy>[0]> = {}) => ({ targetTenantId: "T2", actorId: "admin-1", overwrite: {}, skip: new Set<string>(), ...over });

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("applyTemplateCopy", () => {
  it("fills only blank target keys, leaves filled ones alone, and audits each write as the admin", async () => {
    const { deps, target, audits } = setup(
      [row("business_name", "JCR"), row("business_email", "a@jcr"), row("business_hours", "9-5")],
      [row("business_name", ""), row("business_email", "me@client"), row("business_hours", "9-5")],
    );
    const batch = await applyTemplateCopy(input(), deps);
    expect(batch).toEqual({ status: "ok", results: [{ key: "business_name", status: "filled" }], remaining: 0, done: true });
    expect(target.get("business_email")?.value).toBe("me@client");
    expect(target.get("business_name")?.value).toBe("JCR");
    expect(audits).toEqual([{ row: { tenantId: "T2", actorId: "admin-1", key: "business_name", previousValue: "", newValue: "JCR" }, outcome: "saved" }]);
    expect(deps.invalidate).toHaveBeenCalledTimes(1);
    expect(deps.release).toHaveBeenCalledWith("holder");
  });

  it("overwrites a filled key only when ticked with the token of the value the preview showed", async () => {
    const { deps, target } = setup([row("business_email", "a@jcr"), row("business_phone_number", "555")], [row("business_email", "me@client"), row("business_phone_number", "777")]);
    const batch = await applyTemplateCopy(input({ overwrite: { business_email: tok("business_email", "me@client"), business_phone_number: "tok:stale" } }), deps);
    expect(batch.status === "ok" && [...batch.results].sort((a, b) => a.key.localeCompare(b.key))).toEqual([
      { key: "business_email", status: "overwritten" },
      { key: "business_phone_number", status: "conflict" },
    ]);
    expect(target.get("business_email")?.value).toBe("a@jcr");
    expect(target.get("business_phone_number")?.value).toBe("777");
  });

  it("re-checks right before writing: a key filled after the plan is a conflict, never overwritten", async () => {
    let reads = 0;
    const { deps, target } = setup([row("a", "1"), row("b", "2"), row("c", "3"), row("d", "4"), row("e", "5")], ["a", "b", "c", "d", "e"].map((k) => row(k, "")));
    const realRead = deps.readTarget;
    deps.readTarget = vi.fn(async () => {
      reads += 1;
      // Somebody types into "e" in HighLevel between the plan and its group.
      if (reads === 2) target.get("e")!.value = "owner typed";
      return realRead();
    });
    const batch = await applyTemplateCopy(input(), deps);
    expect(batch.status === "ok" && batch.results.find((r) => r.key === "e")).toEqual({ key: "e", status: "conflict" });
    expect(target.get("e")?.value).toBe("owner typed");
  });

  it("never logs or audits a secret-looking value", async () => {
    const { deps, audits } = setup([row("zz_api_token", "sk-123")], [row("zz_api_token", "")]);
    const info = vi.spyOn(console, "info");
    await applyTemplateCopy(input(), deps);
    expect(audits[0].row.newValue).toBe("[hidden: secret-looking key]");
    expect(JSON.stringify(info.mock.calls)).not.toContain("sk-123");
    expect(deps.update).toHaveBeenCalledWith(expect.objectContaining({ key: "zz_api_token" }), "sk-123");
  });

  it("writes the target's own copy of an image, never the template's link", async () => {
    const { deps, target } = setup([row("business_logo", "https://files.leadconnectorhq.com/jcr-logo")], [row("business_logo", "")]);
    const batch = await applyTemplateCopy(input(), deps);
    expect(batch.status === "ok" && batch.results).toEqual([{ key: "business_logo", status: "filled", image: "uploaded" }]);
    expect(target.get("business_logo")?.value).toBe("https://files.leadconnectorhq.com/target-copy");
  });

  it("leaves an image blank and reports it when media permission is missing", async () => {
    const { deps, target } = setup([row("business_logo", "https://files.leadconnectorhq.com/jcr-logo")], [row("business_logo", "")], {
      copyImage: vi.fn(async () => ({ kind: "needs_media_permission" as const })),
    });
    const batch = await applyTemplateCopy(input(), deps);
    expect(batch.status === "ok" && batch.results).toEqual([{ key: "business_logo", status: "needs_media_permission" }]);
    expect(target.get("business_logo")?.value).toBe("");
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("works in batches: a long list stops at the write cap and reports what remains", async () => {
    const keys = Array.from({ length: 70 }, (_, i) => `k${i}`);
    const { deps } = setup(keys.map((k) => row(k, "v")), keys.map((k) => row(k, "")));
    const first = await applyTemplateCopy(input(), deps);
    expect(first.status === "ok" && first.results.length).toBe(MAX_WRITES_PER_BATCH);
    expect(first.status === "ok" && first.remaining).toBe(10);
    expect(first.status === "ok" && first.done).toBe(false);
    const second = await applyTemplateCopy(input(), deps);
    expect(second.status === "ok" && second.results.length).toBe(10);
    expect(second.status === "ok" && second.done).toBe(true);
  });

  it("skips keys the run already reported", async () => {
    const { deps } = setup([row("a", "1"), row("b", "2")], [row("a", ""), row("b", "")]);
    const batch = await applyTemplateCopy(input({ skip: new Set(["a"]) }), deps);
    expect(batch.status === "ok" && batch.results.map((r) => r.key)).toEqual(["b"]);
  });

  it("calls an unconfirmed write unknown, and a refused one rejected", async () => {
    const { deps } = setup([row("a", "1"), row("b", "2")], [row("a", ""), row("b", "")], {
      update: vi.fn(async (r: CustomValueDetail) => (r.key === "a" ? ("no_answer" as const) : ("rejected" as const))),
    });
    const batch = await applyTemplateCopy(input(), deps);
    expect(batch.status === "ok" && batch.results).toEqual([
      { key: "a", status: "unknown" },
      { key: "b", status: "rejected" },
    ]);
  });

  it("sends a write once more after a 429", async () => {
    let calls = 0;
    const { deps } = setup([row("a", "1")], [row("a", "")], { wasLimited: () => true });
    const realUpdate = deps.update;
    deps.update = vi.fn(async (r, v) => (++calls === 1 ? "retry" : realUpdate(r, v)));
    const batch = await applyTemplateCopy(input(), deps);
    expect(batch.status === "ok" && batch.results).toEqual([{ key: "a", status: "filled" }]);
    expect(deps.update).toHaveBeenCalledTimes(2);
  });

  it("answers busy while a Settings save holds the target's lease, and writes nothing", async () => {
    const { deps } = setup([row("a", "1")], [row("a", "")], { claim: vi.fn(async () => null) });
    expect(await applyTemplateCopy(input(), deps)).toEqual({ status: "busy" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("writes nothing when the template or target cannot be read", async () => {
    const a = setup([], [], { readTemplate: vi.fn(async () => ({ ok: false as const, reason: "permission" as const })) });
    expect(await applyTemplateCopy(input(), a.deps)).toEqual({ status: "template_unreadable" });
    const b = setup([], [], { readTarget: vi.fn(async () => ({ ok: false as const, reason: "retry" as const })) });
    expect(await applyTemplateCopy(input(), b.deps)).toEqual({ status: "target_unreadable" });
    expect(b.deps.release).toHaveBeenCalled();
  });

  it("never writes without an audit row", async () => {
    const { deps } = setup([row("a", "1")], [row("a", "")], { begin: vi.fn(async () => { throw new Error("db"); }) });
    const batch = await applyTemplateCopy(input(), deps);
    expect(batch.status === "ok" && batch.results).toEqual([{ key: "a", status: "failed" }]);
    expect(deps.update).not.toHaveBeenCalled();
  });
});

describe("previewTemplateCopy", () => {
  it("writes nothing", async () => {
    const { deps } = setup([row("a", "1")], [row("a", "")]);
    const answer = await previewTemplateCopy(deps);
    expect(answer.status).toBe("ok");
    expect(deps.update).not.toHaveBeenCalled();
    expect(deps.begin).not.toHaveBeenCalled();
  });
});
