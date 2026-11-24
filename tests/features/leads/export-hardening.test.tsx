// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let search = new URLSearchParams("");
vi.mock("next/navigation", () => ({
  usePathname: () => "/leads",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => search,
}));

import { AppShell, buildBusiness } from "@/features/app-shell";
import { LeadsPage, type Lead, type LeadsResult } from "@/features/leads";

const NOW = new Date("2026-03-04T12:00:00.000Z");
const MESSAGE = "The export did not work. Try again.";
const lead = (): Lead => ({ id: "c1", name: "Pat Test", source: null, need: "", minutesWaiting: 0, address: "", status: "new", receivedAt: "2026-03-04T10:00:00.000Z" });
const ready: LeadsResult = { state: "ready", leads: [lead()], loadedAt: NOW.toISOString(), complete: true, dropped: 0 };
const shell = (children: React.ReactNode) => <AppShell business={buildBusiness({ name: "Sample Roofing", owner: "Pat Lee" })} searchRows={[]}>{children}</AppShell>;
const panel = () => within(screen.getByRole("region", { name: "Export leads" }));

beforeEach(() => {
  search = new URLSearchParams("");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the export failure message", () => {
  it("clears when the owner retries, and the address no longer brings it back", () => {
    search = new URLSearchParams("export=failed");
    window.history.replaceState(null, "", "/leads?export=failed&keep=1");
    render(shell(<LeadsPage result={ready} timeZone="UTC" viewer={{ role: "owner", hasTenant: true }} />));
    expect(panel().getByRole("alert")).toHaveTextContent(MESSAGE);
    fireEvent.submit(panel().getByRole("button", { name: "Export CSV" }).closest("form")!);
    expect(panel().queryByRole("alert")).toBeNull();
    expect(window.location.search).toBe("?keep=1");
  });
  it("shows the reason when the page came back not ready", () => {
    search = new URLSearchParams("export=failed");
    render(shell(<LeadsPage result={{ state: "unavailable" }} viewer={{ role: "owner", hasTenant: true }} />));
    expect(screen.getByText(MESSAGE)).toHaveAttribute("role", "alert");
  });
  it("shows no reason on a not-ready page to someone who cannot export", () => {
    search = new URLSearchParams("export=failed");
    render(shell(<LeadsPage result={{ state: "unavailable" }} viewer={{ role: "office", hasTenant: true }} />));
    expect(screen.queryByText(MESSAGE)).toBeNull();
  });
});
