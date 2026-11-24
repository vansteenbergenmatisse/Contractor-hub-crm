import { beforeEach, describe, expect, it, vi } from "vitest";

// Wave E review: the Change image route must hand the lock check to the feature. Without this test,
// deleting the wiring line would leave every other test green.
const { handleMediaReplace, lockedKeysOf } = vi.hoisted(() => ({
  handleMediaReplace: vi.fn(async () => new Response("ok")),
  lockedKeysOf: vi.fn(async () => new Set(["1_our_work_after"])),
}));

vi.mock("@/features/auth", () => ({ getGuards: () => ({ currentUser: vi.fn() }), hitRateLimit: vi.fn() }));
vi.mock("@/shared/config", () => ({ parseEnv: () => ({ APP_URL: "https://crm.example.test" }) }));
vi.mock("@/features/settings-write-back", () => ({
  handleMediaReplace,
  lockedKeysOf,
  isMediaReplaceEnabled: () => true,
  isWriteBackEnabled: () => true,
  mediaFailure: () => new Response("failed", { status: 500 }),
  replaceTenantImage: vi.fn(),
}));

import { POST } from "../../src/app/api/settings/media/route";

beforeEach(() => vi.clearAllMocks());

describe("POST /api/settings/media and locks", () => {
  it("passes a lock check that reads this tenant's locks", async () => {
    await POST(new Request("https://crm.example.test/api/settings/media", { method: "POST" }));
    const deps = (handleMediaReplace.mock.calls[0] as unknown as [Request, { isLocked?: (t: string, k: string) => Promise<boolean> }])[1];
    expect(deps.isLocked).toBeTypeOf("function");
    expect(await deps.isLocked?.("T1", "1_our_work_after")).toBe(true);
    expect(await deps.isLocked?.("T1", "logo")).toBe(false);
    expect(lockedKeysOf).toHaveBeenCalledWith("T1");
  });
});
