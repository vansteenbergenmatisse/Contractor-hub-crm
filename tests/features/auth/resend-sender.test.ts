import { describe, expect, it, vi } from "vitest";
import { createEmailSenderFromEnv, createResendEmailSender } from "@/features/auth";

const message = { kind: "password_reset" as const, to: "pat@example.test", subject: "Set your password", text: "link https://app.example.test/x" };

describe("Resend sender", () => {
  it("posts to the Resend API with a Bearer key and the message, and reports delivered", async () => {
    const fetchFn = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response("{}", { status: 200 }));
    const sender = createResendEmailSender({ apiKey: "re_key_1", from: "CRM <crm@example.test>", fetch: fetchFn as unknown as typeof fetch });
    expect(await sender.send(message)).toEqual({ delivered: true });
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer re_key_1");
    expect(JSON.parse(init.body as string)).toEqual({ from: "CRM <crm@example.test>", to: ["pat@example.test"], subject: "Set your password", text: message.text });
  });

  it("throws a message with the status only when Resend refuses, never the key or the body", async () => {
    const sender = createResendEmailSender({ apiKey: "re_key_1", from: "a@b.test", fetch: (async () => new Response("secret detail re_key_1", { status: 422 })) as unknown as typeof fetch });
    const error = await sender.send(message).catch((e: Error) => e);
    expect((error as Error).message).toBe("Email provider refused the message (status 422).");
  });

  it("throws a fixed message when the network fails", async () => {
    const sender = createResendEmailSender({ apiKey: "re_key_1", from: "a@b.test", fetch: (async () => { throw new Error("connect re_key_1"); }) as unknown as typeof fetch });
    await expect(sender.send(message)).rejects.toThrow("Email provider could not be reached.");
  });
});

describe("createEmailSenderFromEnv", () => {
  it("is log-only without both variables, and warns", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await createEmailSenderFromEnv({ RESEND_API_KEY: "k" }).send(message)).toEqual({ delivered: false });
    expect(warn).toHaveBeenCalled();
    expect(String(info.mock.calls.at(-1)?.[1] && JSON.stringify(info.mock.calls.at(-1)))).not.toContain("pat@example.test");
    vi.restoreAllMocks();
  });
});
