import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmailSenderFromEnv, createResendEmailSender } from "@/features/auth";
import type { EmailMessage } from "@/features/auth";

// A made-up address standing in for a real client's owner (JCR). No real client value belongs in a test.
const CLIENT_OWNER = "owner@client-fixture.test";
const TEAM = "team@forge-fixture.test";
const KINDS: EmailMessage["kind"][] = ["invite", "password_reset", "admin_alert"];
const base = { RESEND_API_KEY: "re_key_1", EMAIL_FROM: "CRM <crm@forge-fixture.test>" };

const mail = (to: string, kind: EmailMessage["kind"] = "invite"): EmailMessage => ({
  kind,
  to,
  subject: "Subject",
  text: "Open https://app.example.test/invite/SECRET-TOKEN-123",
});
const okFetch = () => vi.fn(async () => new Response("{}", { status: 200 }));
const asFetch = (fn: unknown) => fn as typeof fetch;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("email delivery mode", () => {
  it.each([undefined, "", "  ", "LIVE", "Live", "true", "on", "production", "live ,", "allowlist,live"])(
    "a provider key alone, or the unknown mode %j, sends nothing",
    async (mode) => {
      const fetchFn = okFetch();
      const sender = createEmailSenderFromEnv({ ...base, EMAIL_DELIVERY_MODE: mode, EMAIL_ALLOWED_RECIPIENTS: TEAM }, { fetch: asFetch(fetchFn) });
      expect(await sender.send(mail(TEAM))).toEqual({ delivered: false });
      expect(fetchFn).not.toHaveBeenCalled();
    },
  );

  it("log mode sends nothing even for an allowed address", async () => {
    const fetchFn = okFetch();
    const sender = createEmailSenderFromEnv({ ...base, EMAIL_DELIVERY_MODE: "log", EMAIL_ALLOWED_RECIPIENTS: TEAM }, { fetch: asFetch(fetchFn) });
    expect(await sender.send(mail(TEAM))).toEqual({ delivered: false });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("does not repeat an unknown mode's value in the warning", () => {
    createEmailSenderFromEnv({ ...base, EMAIL_DELIVERY_MODE: "s3cret-typo" }, { fetch: asFetch(okFetch()) });
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("s3cret-typo");
  });

  it.each(["allowlist", "live"])("%s without a provider key or sender stays log-only", async (mode) => {
    const fetchFn = okFetch();
    for (const env of [{ EMAIL_FROM: base.EMAIL_FROM }, { RESEND_API_KEY: base.RESEND_API_KEY }]) {
      const sender = createEmailSenderFromEnv({ ...env, EMAIL_DELIVERY_MODE: mode, EMAIL_ALLOWED_RECIPIENTS: TEAM }, { fetch: asFetch(fetchFn) });
      expect(await sender.send(mail(TEAM))).toEqual({ delivered: false });
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("allowlist mode", () => {
  const allowlist = (list: string | undefined, fetchFn: unknown) =>
    createEmailSenderFromEnv({ ...base, EMAIL_DELIVERY_MODE: "allowlist", EMAIL_ALLOWED_RECIPIENTS: list }, { fetch: asFetch(fetchFn) });

  it.each(KINDS)("blocks the client owner for %s and logs no address or body", async (kind) => {
    const fetchFn = okFetch();
    expect(await allowlist(TEAM, fetchFn).send(mail(CLIENT_OWNER, kind))).toEqual({ delivered: false });
    expect(fetchFn).not.toHaveBeenCalled();
    const logged = JSON.stringify(vi.mocked(console.info).mock.calls);
    expect(logged).not.toContain(CLIENT_OWNER);
    expect(logged).not.toContain("SECRET-TOKEN-123");
  });

  it.each(KINDS)("blocks the client owner for %s in the default mode too", async (kind) => {
    const fetchFn = okFetch();
    const sender = createEmailSenderFromEnv(base, { fetch: asFetch(fetchFn) });
    expect(await sender.send(mail(CLIENT_OWNER, kind))).toEqual({ delivered: false });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each(KINDS)("sends %s to a listed address, ignoring case and spacing in the list", async (kind) => {
    const fetchFn = okFetch();
    const sender = allowlist(` other@forge-fixture.test , ${TEAM.toUpperCase()} `, fetchFn);
    expect(await sender.send(mail(TEAM, kind))).toEqual({ delivered: true });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, "", " , ", "*", "*@client-fixture.test", "@client-fixture.test", "client-fixture.test"])(
    "the list %j allows nobody, and has no wildcard",
    async (list) => {
      const fetchFn = okFetch();
      expect(await allowlist(list, fetchFn).send(mail(CLIENT_OWNER))).toEqual({ delivered: false });
      expect(fetchFn).not.toHaveBeenCalled();
    },
  );

  it.each([
    `${TEAM}, ${CLIENT_OWNER}`,
    `${TEAM},${CLIENT_OWNER}`,
    `${TEAM};${CLIENT_OWNER}`,
    `Team <${TEAM}>`,
    `${CLIENT_OWNER} <${TEAM}>`,
    ` ${TEAM}`,
    `${TEAM}\n`,
    "team+x@forge-fixture.test",
    `${TEAM}.evil.test`,
  ])("refuses the recipient %j, which is not exactly a listed address", async (to) => {
    const fetchFn = okFetch();
    expect(await allowlist(TEAM, fetchFn).send(mail(to))).toEqual({ delivered: false });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("live mode", () => {
  it("sends to any single address", async () => {
    const fetchFn = okFetch();
    const sender = createEmailSenderFromEnv({ ...base, EMAIL_DELIVERY_MODE: "live" }, { fetch: asFetch(fetchFn) });
    expect(await sender.send(mail("someone@example.test"))).toEqual({ delivered: true });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it.each([`a@example.test, ${CLIENT_OWNER}`, "Name <a@example.test>", "not an email"])("still refuses %j", async (to) => {
    const fetchFn = okFetch();
    const sender = createEmailSenderFromEnv({ ...base, EMAIL_DELIVERY_MODE: "live" }, { fetch: asFetch(fetchFn) });
    expect(await sender.send(mail(to))).toEqual({ delivered: false });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("Resend Idempotency-Key", () => {
  const keyOf = async (message: EmailMessage, at: number, from = "a@b.test") => {
    const fetchFn = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response("{}", { status: 200 }));
    await createResendEmailSender({ apiKey: "re_key_1", from, fetch: asFetch(fetchFn), now: () => new Date(at) }).send(message);
    return new Headers(fetchFn.mock.calls[0][1].headers).get("idempotency-key") as string;
  };
  const at = Date.UTC(2026, 10, 23, 12, 10);

  it("repeats for the same message in the same hour, so a retry cannot send twice", async () => {
    expect(await keyOf(mail(TEAM), at)).toBe(await keyOf(mail(TEAM), at + 60_000));
  });
  it("differs for another recipient, body, kind or sender", async () => {
    const key = await keyOf(mail(TEAM), at);
    expect(await keyOf(mail("x@example.test"), at)).not.toBe(key);
    expect(await keyOf({ ...mail(TEAM), text: "other" }, at)).not.toBe(key);
    expect(await keyOf(mail(TEAM, "admin_alert"), at)).not.toBe(key);
    expect(await keyOf(mail(TEAM), at, "c@d.test")).not.toBe(key);
  });
  it("differs a day later, so the next daily alert is not swallowed", async () => {
    expect(await keyOf(mail(TEAM), at + 20 * 3600_000)).not.toBe(await keyOf(mail(TEAM), at));
  });
  it("carries no address, token or key", async () => {
    expect(await keyOf(mail(TEAM), at)).toMatch(/^crm-email-[0-9a-f]{64}$/);
  });
});

describe("Resend 429", () => {
  const limited = (headers: Record<string, string>) =>
    vi.fn(async () => new Response("detail re_key_1 SECRET-TOKEN-123", { status: 429, headers }));

  it("fails once with a fixed message and the wait, and does not retry", async () => {
    const fetchFn = limited({ "retry-after": "30" });
    const sender = createResendEmailSender({ apiKey: "re_key_1", from: "a@b.test", fetch: asFetch(fetchFn) });
    const error = (await sender.send(mail(TEAM)).catch((e: unknown) => e)) as Error & { retryAfterSeconds: number | null };
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(error.name).toBe("EmailRateLimitedError");
    expect(error.message).toBe("Email provider is rate limiting (status 429).");
    expect(error.retryAfterSeconds).toBe(30);
  });

  it("reports an unknown wait as null", async () => {
    const sender = createResendEmailSender({ apiKey: "re_key_1", from: "a@b.test", fetch: asFetch(limited({ "retry-after": "soon" })) });
    const error = (await sender.send(mail(TEAM)).catch((e: unknown) => e)) as { retryAfterSeconds: number | null };
    expect(error.retryAfterSeconds).toBeNull();
  });
});

describe("the guard cannot be walked around", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/.test(name) ? [path] : [];
    });

  it("only the factory builds the real Resend sender in app code", () => {
    const root = join(process.cwd(), "src");
    const callers = walk(root)
      .filter((file) => !file.includes(join("src", "generated")))
      .filter((file) => readFileSync(file, "utf8").includes("createResendEmailSender("))
      .map((file) => file.slice(root.length + 1));
    expect(callers).toEqual([join("features", "auth", "api", "email-sender.ts")]);
  });
});
