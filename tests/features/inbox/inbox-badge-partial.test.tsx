// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/inbox",
  useSearchParams: () => new URLSearchParams(),
}));

import { AppShell, type Business } from "@/features/app-shell";
import { InboxLivePage, type InboxResult } from "@/features/inbox";

afterEach(cleanup);

// All values are fake.
const business = { name: "Test Co", initials: "TC", phone: "", city: "", tag: "", site: "" } as unknown as Business;
const row = (id: string, unreadCount: number) => ({ id, name: `Test ${id}`, channel: null, snippet: "", unreadCount });
const conversations = [row("a", 2), row("b", 1), row("c", 4), row("d", 0)];
const result = (over: Partial<Extract<InboxResult, { state: "ready" }>>): InboxResult => ({
  state: "ready", conversations, complete: true, dropped: 0, selectedId: null, thread: null, ...over,
});
const badge = (r: InboxResult) => {
  const { container } = render(<AppShell business={business} searchRows={[]}><InboxLivePage result={r} /></AppShell>);
  return container.querySelector(".fd-badge");
};

describe("the Inbox badge on a partial list", () => {
  it.each([
    ["cut off", { complete: false }],
    ["with rows left out", { dropped: 1 }],
  ])("%s shows a lower bound", (_name, over) => {
    const el = badge(result(over));
    expect(el?.textContent).toBe("3+");
    expect(el?.getAttribute("aria-label")).toBe("at least 3 unread");
    expect(el?.className).not.toContain("is-off");
  });

  it("a whole list shows the exact count", () => {
    const el = badge(result({}));
    expect(el?.textContent).toBe("3");
    expect(el?.getAttribute("aria-label")).toBe("3 unread");
  });
});
