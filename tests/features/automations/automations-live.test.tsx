// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/automations",
  useRouter: () => ({ push: vi.fn(), refresh }),
  useSearchParams: () => null,
}));

import { AutomationsLivePage, type AutomationsResult } from "@/features/automations";

// Every value is fake.
const ready = (over: Partial<Extract<AutomationsResult, { state: "ready" }>> = {}): AutomationsResult => ({
  state: "ready",
  workflows: [
    { id: "w1", name: "Pat follow up", status: "published" },
    { id: "w2", name: "Draft reminder", status: "draft" },
    { id: "w3", name: "Odd one", status: "unknown" },
  ],
  totals: { published: 1, draft: 1, all: 3 },
  complete: true,
  dropped: 0,
  loadedAt: "2026-03-04T17:00:00.000Z",
  ...over,
});

afterEach(() => {
  cleanup();
  refresh.mockClear();
});

describe("AutomationsLivePage", () => {
  it("lists real workflows with their status and totals", () => {
    const { container } = render(<AutomationsLivePage result={ready()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Automations" })).toBeTruthy();
    expect(container.textContent).toContain("Pat follow up");
    expect(container.textContent).toContain("Published");
    expect(container.textContent).toContain("Draft");
    expect(container.textContent).toContain("Status not known");
    expect(container.querySelectorAll(".fd-rw")).toHaveLength(3);
  });

  it("has no control that can act on a workflow", () => {
    const { container } = render(<AutomationsLivePage result={ready()} />);
    expect(container.querySelectorAll("button, input, select, textarea, a, [role=switch]")).toHaveLength(0);
    expect(container.textContent).not.toMatch(/New automation|Edit|Remove|Send me a test|Publish it/);
  });

  it("says when the list may be short", () => {
    render(<AutomationsLivePage result={ready({ complete: false })} />);
    expect(screen.getByRole("status").textContent).toContain("may be missing");
  });

  it("shows a calm not-enabled state with no reconnect and no retry", () => {
    const { container } = render(<AutomationsLivePage result={{ state: "not-enabled" }} />);
    expect(screen.getByRole("status").textContent).toContain("isn't turned on");
    expect(container.textContent).toContain("don't need to reconnect");
    expect(container.querySelector(".is-bad")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the empty state", () => {
    render(<AutomationsLivePage result={{ state: "empty" }} />);
    expect(screen.getByRole("status").textContent).toContain("No automations");
  });

  it("asks for a reconnect without a retry button", () => {
    render(<AutomationsLivePage result={{ state: "reconnect" }} />);
    expect(screen.getByRole("alert").textContent).toContain("needs attention");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers Try again when unavailable, which only refreshes", () => {
    render(<AutomationsLivePage result={{ state: "unavailable" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
