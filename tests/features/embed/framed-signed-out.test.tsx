import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Inside HighLevel's frame a signed-out request must never be sent to /sign-in (which may not be
// framed, so the frame goes blank). The layout shows a framable page with "Open the CRM full screen".
const { getRequestUser, redirect, requestHeaders } = vi.hoisted(() => ({
  getRequestUser: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
  requestHeaders: { value: new Headers() },
}));

vi.mock("../../../src/app/session", () => ({ getRequestUser }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.value }));
vi.mock("@/features/brand", () => ({ loadBusiness: vi.fn() }));
vi.mock("@/features/app-shell", () => ({ AppShell: "AppShell" }));
vi.mock("@/features/admin", () => ({ ClientViewBanner: "ClientViewBanner" }));
vi.mock("@/features/mailbox-prompt", () => ({ loadMailboxPrompt: vi.fn(), MailboxPromptCard: "MailboxPromptCard" }));
vi.mock("@/features/onboarding", () => ({ scheduleVisitSync: vi.fn() }));

import AppLayout from "../../../src/app/(app)/layout";
import { FramedSignedOut, isFramedRequest } from "../../../src/features/embed";

beforeEach(() => {
  vi.clearAllMocks();
  getRequestUser.mockResolvedValue(null);
});

describe("isFramedRequest", () => {
  it("is true only for Sec-Fetch-Dest: iframe or frame", () => {
    expect(isFramedRequest(new Headers({ "sec-fetch-dest": "iframe" }))).toBe(true);
    expect(isFramedRequest(new Headers({ "sec-fetch-dest": "frame" }))).toBe(true);
    expect(isFramedRequest(new Headers({ "sec-fetch-dest": "document" }))).toBe(false);
    expect(isFramedRequest(new Headers())).toBe(false);
  });
});

describe("signed out inside the frame", () => {
  it("renders the framable page whose main action runs the in-frame sign-in again, instead of redirecting to /sign-in", async () => {
    requestHeaders.value = new Headers({ "sec-fetch-dest": "iframe" });
    const html = renderToStaticMarkup((await AppLayout({ children: "SECRET PAGE" })) as React.ReactElement);
    expect(redirect).not.toHaveBeenCalled();
    // Main action: /embed in this same frame (no target), never "/" (which lands on /sign-in and loops).
    const links = [...html.matchAll(/<a([^>]*)>([^<]*)<\/a>/g)].map((m) => ({ attrs: m[1], text: m[2] }));
    expect(links[0].text).toBe("Sign in again");
    expect(links[0].attrs).toContain('href="/embed"');
    expect(links[0].attrs).not.toContain("target=");
    expect(links[1].text).toBe("Open the CRM full screen");
    expect(links[1].attrs).toMatch(/href="\/"[^>]*target="_top"/);
    expect(links).toHaveLength(2);
    expect(html).not.toContain("SECRET PAGE");
    expect(html).not.toContain("/sign-in");
  });

  it("outside a frame still redirects to /sign-in", async () => {
    requestHeaders.value = new Headers({ "sec-fetch-dest": "document" });
    await expect(AppLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT /sign-in");
  });

  it("says plainly what happened, as a heading and text (static content, no live region)", () => {
    const html = renderToStaticMarkup(<FramedSignedOut />);
    expect(html).toMatch(/<h1[^>]*>Your sign-in ended\.<\/h1>/);
    expect(html).toContain("Tap below to sign in again.");
    expect(html).not.toContain('role="status"');
  });
});
