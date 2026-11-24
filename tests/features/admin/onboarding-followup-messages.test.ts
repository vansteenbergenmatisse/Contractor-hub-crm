import { describe, expect, it } from "vitest";
import { checkResultMessage } from "../../../src/features/admin/components/CheckSubAccountsButton";
import { issuedLinkMessage } from "../../../src/features/admin/api/sign-in-messages";

// What the admin reads after the onboarding review follow-ups.
describe("issuedLinkMessage with an unreadable mail budget", () => {
  it("says the email status is unknown, never that the daily limit was reached", () => {
    const text = issuedLinkMessage({ kind: "set_password", link: "https://crm.example.test/reset-password?token=x", email: "o@acme.test", mail: "unknown" });
    expect(text).toContain("Email status unknown");
    expect(text).not.toMatch(/limit of sign-in emails|reached/);
    expect(text).toContain("Copy the link below");
  });

  it("still says capped when the limit really was reached", () => {
    expect(issuedLinkMessage({ link: "l", email: "o@acme.test", mail: "capped" })).toContain("reached today's limit");
  });
});

describe("checkResultMessage follow-ups", () => {
  it("tells an admin in View as client to exit first", () => {
    expect(checkResultMessage(403, { error: "viewing" })).toBe("You are viewing a client. Exit View as client, then check again.");
  });

  it("a plain 403 stays a generic failure", () => {
    expect(checkResultMessage(403, { error: "forbidden" })).toBe("Could not check HighLevel. Try again.");
  });

  it("every agency throttled: says it was checked less than a minute ago", () => {
    expect(checkResultMessage(200, { connected: 0, failures: 0, agencies: 0, throttled: 1 })).toBe(
      "HighLevel was checked less than a minute ago. Wait a minute and try again.",
    );
  });

  it("some agencies throttled: reports the result and the skipped count", () => {
    expect(checkResultMessage(200, { connected: 1, failures: 0, agencies: 1, throttled: 2 })).toBe(
      "Connected 1 new sub-account. Reload the page to see it. 2 agencies were checked less than a minute ago and skipped.",
    );
  });

  it("nothing throttled: unchanged text", () => {
    expect(checkResultMessage(200, { connected: 0, failures: 1, agencies: 1, throttled: 0 })).toBe(
      "No new sub-accounts with the app installed. 1 step failed; the server log has the details.",
    );
  });
});
