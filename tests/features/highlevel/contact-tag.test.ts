import { describe, expect, it, vi } from "vitest";
import { CRM_ON_MY_WAY_TAG, createContactTagAdapter, createContactTagRequests, HighLevelHttpError, TokenServiceError } from "@/features/highlevel";

// Mocked HighLevel only. All values are fake.
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const query = { calendarId: "cal-1", appointmentId: "appt-1", startMs: 1, endMs: 2 };
const event = (over: Record<string, unknown> = {}) => ({ id: "appt-1", calendarId: "cal-1", locationId: "loc-1", contactId: "contact-1", ...over });

function setup(over: Partial<Parameters<typeof createContactTagAdapter>[0]["requests"]> = {}) {
  const requests = {
    events: vi.fn(async () => json({ events: [event()] })),
    contact: vi.fn(async () => json({ contact: { id: "contact-1", locationId: "loc-1", tags: [] } })),
    removeTag: vi.fn(async () => json({ tags: [] })),
    addTag: vi.fn(async () => json({ tags: [CRM_ON_MY_WAY_TAG] }, 201)),
    ...over,
  };
  const adapter = createContactTagAdapter({
    readLocationId: async () => "loc-1",
    withToken: (_tenantId, call) => call("token"),
    requests,
  });
  return { adapter, requests };
}

describe("the HTTP contract", () => {
  it("adds and removes the tag on the documented paths, with the documented version and body", async () => {
    const doFetch = vi.fn(async () => json({ tags: [] })) as unknown as typeof fetch;
    const requests = createContactTagRequests("https://hl.test/", doFetch);
    await requests.addTag("tok", "c/1");
    await requests.removeTag("tok", "c/1");
    const calls = (doFetch as unknown as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
    expect(calls[0][0]).toBe("https://hl.test/contacts/c%2F1/tags");
    expect(calls[0][1].method).toBe("POST");
    expect(calls[1][1].method).toBe("DELETE");
    for (const [, init] of calls) {
      expect(init.body).toBe(JSON.stringify({ tags: ["crm_on_my_way"] }));
      expect(init.headers).toMatchObject({ authorization: "Bearer tok", version: "2021-07-28", "content-type": "application/json" });
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("turns a network failure into an error with no status", async () => {
    const requests = createContactTagRequests("https://hl.test", vi.fn(async () => { throw new Error("down"); }) as unknown as typeof fetch);
    await expect(requests.addTag("tok", "c")).rejects.toMatchObject({ status: null });
    await expect(requests.addTag("tok", "c")).rejects.toBeInstanceOf(HighLevelHttpError);
  });
});

describe("reading the appointment's contact", () => {
  it("finds it on the exact event", async () => {
    expect(await setup().adapter.readAppointmentContact("T1", query)).toEqual({ ok: true, contactId: "contact-1" });
  });

  it("is null when the event has no contact", async () => {
    const { adapter } = setup({ events: vi.fn(async () => json({ events: [event({ contactId: "  " })] })) });
    expect(await adapter.readAppointmentContact("T1", query)).toEqual({ ok: true, contactId: null });
  });

  it.each([{ locationId: "other" }, { calendarId: "other" }, { id: "other" }])("refuses a row with %j", async (over) => {
    const { adapter } = setup({ events: vi.fn(async () => json({ events: [event(over)] })) });
    expect((await adapter.readAppointmentContact("T1", query)).ok).toBe(false);
  });

  it("fails on a bad answer", async () => {
    const { adapter } = setup({ events: vi.fn(async () => json({}, 500)) });
    expect(await adapter.readAppointmentContact("T1", query)).toEqual({ ok: false });
  });
});

describe("reading the contact's tags", () => {
  it.each([[["crm_on_my_way"], true], [["CRM_On_My_Way"], true], [["other"], false], [[], false]])("%j has the tag: %s", async (tags, hasTag) => {
    const { adapter } = setup({ contact: vi.fn(async () => json({ contact: { id: "contact-1", locationId: "loc-1", tags } })) });
    expect(await adapter.readContactTagState("T1", "contact-1")).toEqual({ ok: true, hasTag });
  });

  it.each([
    { id: "contact-1", locationId: "other", tags: [] },
    { id: "contact-1", tags: [] },
    { id: "other", locationId: "loc-1", tags: [] },
    { id: "contact-1", locationId: "loc-1", tags: "x" },
  ])("refuses %j", async (contact) => {
    const { adapter } = setup({ contact: vi.fn(async () => json({ contact })) });
    expect(await adapter.readContactTagState("T1", "contact-1")).toEqual({ ok: false });
  });
});

describe("firing the trigger", () => {
  it("only adds when the tag is absent", async () => {
    const { adapter, requests } = setup();
    expect(await adapter.pulseTag("T1", "contact-1", false)).toBe("sent");
    expect(requests.removeTag).not.toHaveBeenCalled();
    expect(requests.addTag).toHaveBeenCalledTimes(1);
  });

  it("removes first when the tag is present, then adds", async () => {
    const { adapter, requests } = setup();
    expect(await adapter.pulseTag("T1", "contact-1", true)).toBe("sent");
    expect(vi.mocked(requests.removeTag).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(requests.addTag).mock.invocationCallOrder[0]);
  });

  it.each([400, 404, 422, 500])("does not add after a failed remove (%i): nothing fired", async (status) => {
    const { adapter, requests } = setup({ removeTag: vi.fn(async () => json({}, status)) });
    expect(await adapter.pulseTag("T1", "contact-1", true)).toBe("failed");
    expect(requests.addTag).not.toHaveBeenCalled();
  });

  it("does not add after a remove with no answer: nothing fired", async () => {
    const { adapter, requests } = setup({ removeTag: vi.fn(async () => { throw new HighLevelHttpError("x", null); }) });
    expect(await adapter.pulseTag("T1", "contact-1", true)).toBe("failed");
    expect(requests.addTag).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 404, 422, 429])("a clear refusal of the add (%i) is failed", async (status) => {
    const { adapter, requests } = setup({ addTag: vi.fn(async () => json({}, status)) });
    expect(await adapter.pulseTag("T1", "contact-1", false)).toBe("failed");
    expect(requests.addTag).toHaveBeenCalledTimes(1);
  });

  it.each([500, 502, 503, 504])("a server error on the add (%i) is no answer, with no retry", async (status) => {
    const { adapter, requests } = setup({ addTag: vi.fn(async () => json({}, status)) });
    expect(await adapter.pulseTag("T1", "contact-1", false)).toBe("no_answer");
    expect(requests.addTag).toHaveBeenCalledTimes(1);
  });

  it("a timeout on the add is no answer", async () => {
    const { adapter } = setup({ addTag: vi.fn(async () => { throw new HighLevelHttpError("x", null); }) });
    expect(await adapter.pulseTag("T1", "contact-1", false)).toBe("no_answer");
  });

  it("no token means nothing was sent", async () => {
    const adapter = createContactTagAdapter({
      readLocationId: async () => "loc-1",
      withToken: async () => { throw new TokenServiceError("unavailable"); },
      requests: setup().requests,
    });
    expect(await adapter.pulseTag("T1", "contact-1", false)).toBe("failed");
  });
});
