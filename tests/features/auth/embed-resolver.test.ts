import CryptoJS from "crypto-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The wiring in instance.ts: HighLevel env secret -> real decrypt -> real resolve rules -> database
// lookup (mocked). A wrong secret, a wrong location or an env failure must all end in null.
const findEmbedCandidate = vi.fn();
const parseEnv = vi.fn();
vi.mock("@/features/embed", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/embed")>()),
  findEmbedCandidate,
}));
vi.mock("@/shared/config", () => ({ parseEnv }));

const SECRET = "shared-secret-1";
const payload = (value: object, secret = SECRET) => CryptoJS.AES.encrypt(JSON.stringify(value), secret).toString();
const owner = { userId: "u1", role: "owner", disabledAt: null, tenant: { status: "connected", companyId: "co_1" } };

beforeEach(() => {
  vi.clearAllMocks();
  parseEnv.mockReturnValue({ GHL_APP_SHARED_SECRET: SECRET });
});

describe("resolveEmbedUserId", () => {
  it("returns the user id and looks up the lower-cased email with the sub-account id", async () => {
    findEmbedCandidate.mockResolvedValue(owner);
    const { resolveEmbedUserId } = await import("../../../src/features/auth/api/instance");
    expect(await resolveEmbedUserId(payload({ email: "Pat@X.test", activeLocation: "loc_1", companyId: "co_1" }))).toBe("u1");
    expect(findEmbedCandidate).toHaveBeenCalledWith({ email: "pat@x.test", locationId: "loc_1" });
    expect(parseEnv).toHaveBeenCalledWith("highlevel");
  });

  it("gives null for a payload made with another secret, without touching the database", async () => {
    const { resolveEmbedUserId } = await import("../../../src/features/auth/api/instance");
    expect(await resolveEmbedUserId(payload({ email: "a@x.test", activeLocation: "l" }, "another"))).toBeNull();
    expect(findEmbedCandidate).not.toHaveBeenCalled();
  });

  it("gives null for an agency-level payload (no activeLocation)", async () => {
    const { resolveEmbedUserId } = await import("../../../src/features/auth/api/instance");
    expect(await resolveEmbedUserId(payload({ email: "a@x.test" }))).toBeNull();
    expect(findEmbedCandidate).not.toHaveBeenCalled();
  });

  it("gives null when the user's tenant belongs to another company than the payload says", async () => {
    findEmbedCandidate.mockResolvedValue(owner);
    const { resolveEmbedUserId } = await import("../../../src/features/auth/api/instance");
    expect(await resolveEmbedUserId(payload({ email: "a@x.test", activeLocation: "l", companyId: "other" }))).toBeNull();
  });

  it("gives null when the environment is incomplete or the database fails", async () => {
    const { resolveEmbedUserId } = await import("../../../src/features/auth/api/instance");
    parseEnv.mockImplementation(() => {
      throw new Error("missing GHL_APP_SHARED_SECRET");
    });
    expect(await resolveEmbedUserId(payload({ email: "a@x.test", activeLocation: "l" }))).toBeNull();
    parseEnv.mockReturnValue({ GHL_APP_SHARED_SECRET: SECRET });
    findEmbedCandidate.mockRejectedValue(new Error("db down"));
    expect(await resolveEmbedUserId(payload({ email: "a@x.test", activeLocation: "l" }))).toBeNull();
  });
});
