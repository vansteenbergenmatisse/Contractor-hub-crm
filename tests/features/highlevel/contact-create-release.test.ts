import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contactClaimKeys, createContactOnce, type ContactCreateOutcome } from "@/features/highlevel";

const SECRET = "test-secret-not-real";
const input = { name: "Pat", phone: "(555) 010-0000", email: "pat@example.test", address: "", source: "Email" };

const store = () => {
  const taken = new Set<string>();
  return {
    taken,
    claim: vi.fn(async (key: string) => {
      if (taken.has(key)) return false;
      taken.add(key);
      return true;
    }),
    release: vi.fn(async (key: string) => { taken.delete(key); }),
  };
};
const answering = (...outcomes: ContactCreateOutcome[]) => {
  const create = vi.fn(async (): Promise<ContactCreateOutcome> => ({ status: "created" }));
  for (const outcome of outcomes) create.mockResolvedValueOnce(outcome);
  return create;
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("releasing the contact claim", () => {
  it.each(["failed", "duplicate", "invalid_phone"] as const)("lets a retry through after a definite %s", async (status) => {
    const s = store();
    const create = answering({ status });
    expect(await createContactOnce("t1", input, { secret: SECRET, ...s, create })).toEqual({ status });
    expect(s.taken.size).toBe(0);
    expect(await createContactOnce("t1", input, { secret: SECRET, ...s, create })).toEqual({ status: "created" });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("keeps the claim after an unsure answer, so a retry cannot double the contact", async () => {
    const s = store();
    const create = answering({ status: "unsure" });
    await createContactOnce("t1", input, { secret: SECRET, ...s, create });
    expect(s.release).not.toHaveBeenCalled();
    expect(await createContactOnce("t1", input, { secret: SECRET, ...s, create })).toEqual({ status: "in_progress" });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("keeps the claim after a create", async () => {
    const s = store();
    await createContactOnce("t1", input, { secret: SECRET, ...s, create: answering() });
    expect(s.release).not.toHaveBeenCalled();
    expect(s.taken.size).toBe(2);
  });

  it("keeps the claim when the create throws", async () => {
    const s = store();
    const create = vi.fn(async (): Promise<ContactCreateOutcome> => { throw new Error("lost"); });
    await expect(createContactOnce("t1", input, { secret: SECRET, ...s, create })).rejects.toThrow("lost");
    expect(s.release).not.toHaveBeenCalled();
  });

  it("gives back only its own key when the second claim is refused", async () => {
    const s = store();
    const [phoneKey, emailKey] = contactClaimKeys(SECRET, "t1", input.phone, input.email)!;
    s.taken.add(emailKey);
    const create = answering();
    expect(await createContactOnce("t1", input, { secret: SECRET, ...s, create })).toEqual({ status: "in_progress" });
    expect(s.release.mock.calls).toEqual([[phoneKey]]);
    expect(s.taken.has(emailKey)).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });

  it("gives back a held key when a later claim throws", async () => {
    const s = store();
    const [phoneKey] = contactClaimKeys(SECRET, "t1", input.phone, input.email)!;
    s.claim.mockImplementationOnce(async (key) => { s.taken.add(key); return true; }).mockRejectedValueOnce(new Error("db down"));
    expect(await createContactOnce("t1", input, { secret: SECRET, ...s, create: answering() })).toEqual({ status: "failed" });
    expect(s.release.mock.calls).toEqual([[phoneKey]]);
  });

  it("keeps the outcome when the release itself fails", async () => {
    const s = store();
    s.release.mockRejectedValue(new Error("db down"));
    expect(await createContactOnce("t1", input, { secret: SECRET, ...s, create: answering({ status: "failed" }) })).toEqual({ status: "failed" });
  });

  it("keeps tenants apart", async () => {
    const s = store();
    await createContactOnce("t1", input, { secret: SECRET, ...s, create: answering({ status: "unsure" }) });
    await createContactOnce("t2", input, { secret: SECRET, ...s, create: answering({ status: "failed" }) });
    const t1 = contactClaimKeys(SECRET, "t1", input.phone, input.email)!;
    const t2 = contactClaimKeys(SECRET, "t2", input.phone, input.email)!;
    expect(t1.every((key) => s.taken.has(key))).toBe(true);
    expect(t2.some((key) => s.taken.has(key))).toBe(false);
    expect(s.release.mock.calls.flat().every((key) => t2.includes(key as string))).toBe(true);
  });
});
