import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFailedSendAlerter, createFailedSendAlerterFromEnv } from "@/features/alerts";
import type { FailedSendAlert } from "@/features/alerts";

const WEBHOOK = "https://hooks.slack.com/services/T000/B000/placeholder";
const TENANT = `c${"a1".repeat(12)}`;
const OTHER_TENANT = `c${"b2".repeat(12)}`;
const CORRELATION = "123e4567-e89b-42d3-a456-426614174000";
const MINUTE = 60_000;

const alert = (over: Partial<FailedSendAlert> = {}): FailedSendAlert => ({
  tenantId: TENANT,
  channel: "text",
  category: "provider_rejected",
  count: 1,
  correlationId: CORRELATION,
  ...over,
});

function setup(responses: Array<Response | Error> = []) {
  let time = Date.UTC(2026, 10, 23, 12);
  const fetchFn = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => {
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next ?? new Response("ok", { status: 200 });
  });
  const alerter = createFailedSendAlerter({
    webhookUrl: WEBHOOK,
    appUrl: "https://app.example.test/some/path",
    fetch: fetchFn as unknown as typeof fetch,
    now: () => time,
  });
  return { alerter, fetchFn, advance: (ms: number) => (time += ms) };
}
const textOf = (fetchFn: ReturnType<typeof setup>["fetchFn"], call = 0) =>
  (JSON.parse(fetchFn.mock.calls[call][1].body as string) as { text: string }).text;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("payload", () => {
  it("posts only the six allowed facts to the webhook", async () => {
    const { alerter, fetchFn } = setup();
    expect(await alerter.alert(alert({ count: 3 }))).toEqual({ status: "sent" });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(WEBHOOK);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["text"]);
    expect(body.text).toBe(
      [
        "Failed send",
        `Tenant: ${TENANT}`,
        "Channel: text",
        "Error: provider_rejected",
        "Count: 3",
        `Correlation: ${CORRELATION}`,
        "Admin: https://app.example.test/admin/clients",
      ].join("\n"),
    );
  });

  it("drops extra fields such as names, phones, emails and message text", async () => {
    const { alerter, fetchFn } = setup();
    const withPersonalData = {
      ...alert(),
      name: "Pat Example",
      phone: "+15555550100",
      email: "pat@example.test",
      message: "Your quote is ready",
      error: new Error("failed for pat@example.test"),
    };
    await alerter.alert(withPersonalData);
    const sent = fetchFn.mock.calls[0][1].body as string;
    for (const value of ["Pat", "5555550100", "pat@example.test", "quote", "failed for"]) expect(sent).not.toContain(value);
  });

  it.each([
    ["tenantId", "Pat Example"],
    ["tenantId", "pat@example.test"],
    ["tenantId", "+15555550100"],
    ["tenantId", "5555550100"],
    ["tenantId", "patexample"],
    ["tenantId", `${TENANT}\nName: Pat`],
    ["correlationId", "Pat Example"],
    ["correlationId", "pat@example.test"],
    ["correlationId", "+15555550100"],
    ["correlationId", "Your quote is ready"],
    ["correlationId", `${CORRELATION} <@channel>`],
    ["channel", "Pat Example"],
    ["channel", "+15555550100"],
    ["category", "pat@example.test"],
    ["category", "Your quote is ready"],
    ["count", 0],
    ["count", -1],
    ["count", 1.5],
    ["count", Number.NaN],
    ["count", "+15555550100"],
    ["count", 1_000_001],
  ])("refuses %s = %j and posts nothing", async (field, value) => {
    const { alerter, fetchFn } = setup();
    expect(await alerter.alert({ ...alert(), [field]: value } as FailedSendAlert)).toEqual({ status: "invalid" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("omits the admin link when APP_URL is not https", async () => {
    const fetchFn = vi.fn(async () => new Response("ok"));
    const alerter = createFailedSendAlerter({ webhookUrl: WEBHOOK, appUrl: "javascript:alert(1)", fetch: fetchFn as unknown as typeof fetch });
    await alerter.alert(alert());
    const init = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.body as string).not.toContain("Admin:");
    expect(init.body as string).not.toContain("javascript");
  });
});

describe("configuration", () => {
  it.each([
    undefined,
    "",
    "http://hooks.slack.com/services/T/B/x",
    "https://evil.example/services/T/B/x",
    "https://hooks.slack.com.evil.example/services/T/B/x",
    "https://user@hooks.slack.com/services/T/B/x",
    "https://hooks.slack.com/other/T/B/x",
    "not a url",
  ])("is off and calls nothing for the webhook %j", async (url) => {
    const fetchFn = vi.fn(async () => new Response("ok"));
    const alerter = createFailedSendAlerterFromEnv(
      { SLACK_FAILED_SEND_WEBHOOK_URL: url, APP_URL: "https://app.example.test" },
      { fetch: fetchFn as unknown as typeof fetch },
    );
    expect(await alerter.alert(alert())).toEqual({ status: "disabled" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("lists the env names with empty values in .env.example", () => {
    const example = readFileSync(join(process.cwd(), ".env.example"), "utf8");
    for (const name of ["EMAIL_DELIVERY_MODE", "EMAIL_ALLOWED_RECIPIENTS", "SLACK_FAILED_SEND_WEBHOOK_URL"]) {
      expect(example).toMatch(new RegExp(`^${name}=""$`, "m"));
    }
  });
});

describe("throttle", () => {
  it("sends one alert per tenant and category per 15 minutes", async () => {
    const { alerter, fetchFn, advance } = setup();
    await alerter.alert(alert());
    advance(14 * MINUTE);
    expect(await alerter.alert(alert())).toEqual({ status: "throttled" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    advance(MINUTE);
    expect(await alerter.alert(alert())).toEqual({ status: "sent" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("keeps tenants and categories apart", async () => {
    const { alerter, fetchFn } = setup();
    await alerter.alert(alert());
    await alerter.alert(alert({ tenantId: OTHER_TENANT }));
    await alerter.alert(alert({ category: "timeout" }));
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("adds the held-back failures to the next alert's count", async () => {
    const { alerter, fetchFn, advance } = setup();
    await alerter.alert(alert());
    await alerter.alert(alert({ count: 2 }));
    await alerter.alert(alert({ count: 4 }));
    advance(15 * MINUTE);
    await alerter.alert(alert());
    expect(textOf(fetchFn, 1)).toContain("Count: 7");
  });

  it("sends once when calls arrive at the same time", async () => {
    const { alerter, fetchFn } = setup();
    const results = await Promise.all([alerter.alert(alert()), alerter.alert(alert()), alerter.alert(alert())]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.status === "sent")).toHaveLength(1);
  });

  it("keeps its memory bounded across many tenants", async () => {
    const { alerter, fetchFn } = setup();
    const tenant = (i: number) => `c${i.toString(36).padStart(24, "0")}`;
    for (let i = 0; i < 1100; i += 1) await alerter.alert(alert({ tenantId: tenant(i) }));
    expect(fetchFn.mock.calls.length).toBeLessThanOrEqual(1000);
    expect(alerter.trackedKeys()).toBeLessThanOrEqual(1000);
  });
});

describe("Slack refusing or failing", () => {
  it("honors Retry-After for every tenant, then sends again", async () => {
    const { alerter, fetchFn, advance } = setup([new Response("", { status: 429, headers: { "retry-after": "120" } })]);
    expect(await alerter.alert(alert())).toEqual({ status: "failed" });
    advance(119_000);
    expect(await alerter.alert(alert({ tenantId: OTHER_TENANT }))).toEqual({ status: "throttled" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    advance(1_000);
    expect(await alerter.alert(alert({ tenantId: OTHER_TENANT }))).toEqual({ status: "sent" });
  });

  it("waits a minute when a 429 has no usable Retry-After", async () => {
    const { alerter, fetchFn, advance } = setup([new Response("", { status: 429 })]);
    await alerter.alert(alert());
    advance(59_000);
    await alerter.alert(alert());
    expect(fetchFn).toHaveBeenCalledTimes(1);
    advance(1_000);
    await alerter.alert(alert());
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("keeps the count after a failed post and retries after a short wait", async () => {
    const { alerter, fetchFn, advance } = setup([new Response("", { status: 500 })]);
    expect(await alerter.alert(alert({ count: 2 }))).toEqual({ status: "failed" });
    expect(await alerter.alert(alert())).toEqual({ status: "throttled" });
    advance(MINUTE);
    expect(await alerter.alert(alert())).toEqual({ status: "sent" });
    expect(textOf(fetchFn, 1)).toContain("Count: 4");
  });

  it("never throws, whatever fails", async () => {
    const { alerter } = setup([new Error("network down")]);
    await expect(alerter.alert(alert())).resolves.toEqual({ status: "failed" });

    const throwingClock = createFailedSendAlerter({
      webhookUrl: WEBHOOK,
      appUrl: "https://app.example.test",
      fetch: (async () => new Response("ok")) as unknown as typeof fetch,
      now: () => {
        throw new Error("clock");
      },
    });
    await expect(throwingClock.alert(alert())).resolves.toEqual({ status: "failed" });

    vi.mocked(console.warn).mockImplementation(() => {
      throw new Error("log down");
    });
    const { alerter: second } = setup([new Error("network down")]);
    await expect(second.alert(alert())).resolves.toEqual({ status: "failed" });
    await expect(second.alert(null as unknown as FailedSendAlert)).resolves.toEqual({ status: "invalid" });
  });

  it("never logs the webhook address or the response body", async () => {
    const { alerter } = setup([new Response("detail pat@example.test", { status: 500 }), new Error(`connect ${WEBHOOK}`)]);
    await alerter.alert(alert());
    await alerter.alert(alert({ category: "timeout" }));
    const logged = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(logged).not.toContain("hooks.slack.com");
    expect(logged).not.toContain("pat@example.test");
  });
});
