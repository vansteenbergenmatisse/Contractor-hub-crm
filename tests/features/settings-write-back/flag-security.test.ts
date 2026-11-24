import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleMediaReplace,
  handleSaveValues,
  isMediaReplaceEnabled,
  isWriteBackEnabled,
  type MediaRouteDeps,
} from "@/features/settings-write-back";

// The routes with the real flag functions and env, not a stubbed isEnabled. Made-up ids.
const ORIGIN = "https://app.example.test";
type Role = "owner" | "office" | "admin";
const user = (role: Role, tenantId = "T1", viewing = false) => ({ id: "U1", role, tenantId, viewing });

function onForAll(exclude = "") {
  vi.stubEnv("SETTINGS_WRITE_BACK_ENABLED", "true");
  vi.stubEnv("SETTINGS_WRITE_BACK_ALL", "true");
  vi.stubEnv("SETTINGS_WRITE_BACK_TENANTS", "");
  vi.stubEnv("SETTINGS_WRITE_BACK_EXCLUDE", exclude);
  vi.stubEnv("SETTINGS_MEDIA_REPLACE_ENABLED", "true");
  vi.stubEnv("SETTINGS_MEDIA_REPLACE_ALL", "true");
  vi.stubEnv("SETTINGS_MEDIA_REPLACE_TENANTS", "");
  vi.stubEnv("SETTINGS_MEDIA_REPLACE_EXCLUDE", exclude);
}

const saveRequest = () => new Request(`${ORIGIN}/api/settings/values`, {
  method: "POST",
  headers: { origin: ORIGIN, "content-type": "application/json" },
  body: JSON.stringify({ changes: [{ key: "business_phone_number", expected: "111", value: "222" }] }),
});
const mediaRequest = () => {
  const body = new FormData();
  body.append("key", "1_our_work_after");
  body.append("expected", "https://a.test/o.webp");
  body.append("file", new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }));
  return new Request(`${ORIGIN}/api/settings/media`, { method: "POST", headers: { origin: ORIGIN }, body });
};

function saveDeps(who: ReturnType<typeof user>) {
  return {
    appOrigin: ORIGIN,
    currentUser: vi.fn(async () => who),
    isEnabled: (tenantId: string) => isWriteBackEnabled(tenantId),
    hit: vi.fn(async () => true),
    save: vi.fn(async () => ({ results: [] })),
  };
}
function mediaDeps(who: ReturnType<typeof user>) {
  const replace = vi.fn<MediaRouteDeps["replace"]>(async () => ({ status: "saved", url: "https://files.example.test/x" }));
  return {
    appOrigin: ORIGIN,
    currentUser: vi.fn(async () => who),
    isEnabled: (tenantId: string) => isWriteBackEnabled(tenantId) && isMediaReplaceEnabled(tenantId),
    hit: vi.fn(async () => true),
    replace,
  } satisfies MediaRouteDeps;
}

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.unstubAllEnvs());

describe("save and media routes with write-back on for all", () => {
  it("answer 404 to an owner of an excluded tenant and never write", async () => {
    onForAll("T9,T1");
    const s = saveDeps(user("owner"));
    expect((await handleSaveValues(saveRequest(), s)).status).toBe(404);
    expect(s.save).not.toHaveBeenCalled();
    const m = mediaDeps(user("owner"));
    expect((await handleMediaReplace(mediaRequest(), m)).status).toBe(404);
    expect(m.replace).not.toHaveBeenCalled();
  });

  it("refuse an office user with 403", async () => {
    onForAll();
    const s = saveDeps(user("office"));
    expect((await handleSaveValues(saveRequest(), s)).status).toBe(403);
    expect(s.save).not.toHaveBeenCalled();
    const m = mediaDeps(user("office"));
    expect((await handleMediaReplace(mediaRequest(), m)).status).toBe(403);
    expect(m.replace).not.toHaveBeenCalled();
  });

  it("refuse an admin viewing as the client with 403", async () => {
    onForAll();
    const s = saveDeps(user("admin", "T1", true));
    expect((await handleSaveValues(saveRequest(), s)).status).toBe(403);
    expect(s.save).not.toHaveBeenCalled();
    const m = mediaDeps(user("admin", "T1", true));
    expect((await handleMediaReplace(mediaRequest(), m)).status).toBe(403);
    expect(m.replace).not.toHaveBeenCalled();
  });

  it("let an owner of a tenant that is not excluded through", async () => {
    onForAll("T9");
    const s = saveDeps(user("owner"));
    expect((await handleSaveValues(saveRequest(), s)).status).toBe(200);
    expect(s.save).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "T1" }));
  });
});

describe("adversarial flag values", () => {
  const ON = { SETTINGS_WRITE_BACK_ENABLED: "true", SETTINGS_WRITE_BACK_ALL: "true" };

  it.each(["TRUE", "1", " true", "true ", "yes"])("ALL=%j stays off", (all) => {
    expect(isWriteBackEnabled("T1", { SETTINGS_WRITE_BACK_ENABLED: "true", SETTINGS_WRITE_BACK_ALL: all })).toBe(false);
    expect(isMediaReplaceEnabled("T1", { SETTINGS_MEDIA_REPLACE_ENABLED: "true", SETTINGS_MEDIA_REPLACE_ALL: all })).toBe(false);
  });

  it("excludes an id written with spaces around it", () => {
    expect(isWriteBackEnabled("T1", { ...ON, SETTINGS_WRITE_BACK_EXCLUDE: " T1 " })).toBe(false);
  });

  it("does not exclude an id in another case", () => {
    expect(isWriteBackEnabled("T1", { ...ON, SETTINGS_WRITE_BACK_EXCLUDE: "t1" })).toBe(true);
  });

  it.each(["", ",", "T9,", ",,", " "])("EXCLUDE=%j neither excludes everyone nor matches a blank id", (exclude) => {
    expect(isWriteBackEnabled("T1", { ...ON, SETTINGS_WRITE_BACK_EXCLUDE: exclude })).toBe(true);
    expect(isWriteBackEnabled("", { ...ON, SETTINGS_WRITE_BACK_EXCLUDE: exclude })).toBe(false);
  });

  it("does not match part of an id", () => {
    expect(isWriteBackEnabled("T1", { ...ON, SETTINGS_WRITE_BACK_EXCLUDE: "T10,T" })).toBe(true);
  });
});
