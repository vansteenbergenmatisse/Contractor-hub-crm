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
  it("renders the framable page with the full-screen button instead of redirecting to /sign-in", async () => {
    requestHeaders.value = new Headers({ "sec-fetch-dest": "iframe" });
    const html = renderToStaticMarkup((await AppLayout({ children: "SECRET PAGE" })) as React.ReactElement);
    expect(redirect).not.toHaveBeenCalled();
    expect(html).toContain("Open the CRM full screen");
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*target="_top"/);
    expect(html).not.toContain("SECRET PAGE");
    expect(html).not.toContain("/sign-in");
  });

  it("outside a frame still redirects to /sign-in", async () => {
    requestHeaders.value = new Headers({ "sec-fetch-dest": "document" });
    await expect(AppLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT /sign-in");
  });

  it("the page offers a new tab as a second way", () => {
    const html = renderToStaticMarkup(<FramedSignedOut />);
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  });
});
