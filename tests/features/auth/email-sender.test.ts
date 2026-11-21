import { describe, expect, it, vi } from "vitest";
import { createLogEmailSender, maskEmail } from "@/features/auth";

describe("maskEmail", () => {
  it("keeps the first character of the name and the domain", () => {
    expect(maskEmail("pat@example.test")).toBe("p***@example.test");
    expect(maskEmail("a@example.test")).toBe("a***@example.test");
  });
  it("never echoes something that is not an email", () => {
    expect(maskEmail("not an email")).toBe("***");
    expect(maskEmail("")).toBe("***");
  });
});

describe("log-only email sender", () => {
  const message = {
    kind: "invite" as const,
    to: "pat@example.test",
    subject: "You are invited",
    text: "Open https://app.example.test/invite/SECRET-TOKEN-123 to set your password",
  };

  it("logs the kind, the masked recipient and the subject, once", async () => {
    const log = vi.fn();
    await createLogEmailSender(log).send(message);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toEqual({ kind: "invite", to: "p***@example.test", subject: "You are invited" });
  });

  it("never logs the body (it holds the invite or reset link) or the full address", async () => {
    const log = vi.fn();
    await createLogEmailSender(log).send(message);
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain("SECRET-TOKEN-123");
    expect(logged).not.toContain("pat@example.test");
  });

  it("reports that nothing was sent", async () => {
    expect(await createLogEmailSender(() => {}).send(message)).toEqual({ delivered: false });
  });
});
