// @vitest-environment happy-dom
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { AppShell, buildBusiness, useShell, type ShellApi } from "@/features/app-shell";

// Made-up values only.
const server = (owner: string, phone = "111") => buildBusiness({ name: "Sample Co", owner, phone });
const latest: { current: ShellApi | null } = { current: null };
const api = { updateBusiness: (patch: Parameters<ShellApi["updateBusiness"]>[0]) => latest.current?.updateBusiness(patch) };
function Probe() {
  const shell = useShell();
  useEffect(() => {
    latest.current = shell;
  });
  return <output data-testid="probe">{`${shell.business.owner}|${shell.business.phone}`}</output>;
}
const frame = (business: ReturnType<typeof server>) => <AppShell business={business} searchRows={[]}><Probe /></AppShell>;
const shown = () => screen.getByTestId("probe").textContent;

afterEach(cleanup);

describe("the frame's override after a save", () => {
  it("shows the saved value while the server still holds the pre-save value", () => {
    const view = render(frame(server("Old Name")));
    act(() => api.updateBusiness({ owner: "New Name" }));
    view.rerender(frame(server("Old Name")));
    expect(shown()).toBe("New Name|111");
  });

  it("follows a later edit made in HighLevel", () => {
    const view = render(frame(server("Old Name")));
    act(() => api.updateBusiness({ owner: "New Name" }));
    view.rerender(frame(server("Edited In HighLevel")));
    expect(shown()).toBe("Edited In HighLevel|111");
  });

  it("does not bring the override back when the server returns to the pre-save value", () => {
    const view = render(frame(server("Old Name")));
    act(() => api.updateBusiness({ owner: "New Name" }));
    view.rerender(frame(server("New Name")));
    view.rerender(frame(server("Old Name")));
    expect(shown()).toBe("Old Name|111");
  });

  it("settles each field on its own", () => {
    const view = render(frame(server("Old Name", "111")));
    act(() => api.updateBusiness({ owner: "New Name", phone: "222" }));
    view.rerender(frame(server("Edited In HighLevel", "111")));
    expect(shown()).toBe("Edited In HighLevel|222");
  });

  it("drops a field the server moved on from when a later save patches another field", () => {
    const view = render(frame(server("Old Name", "111")));
    act(() => api.updateBusiness({ owner: "New Name" }));
    view.rerender(frame(server("Edited In HighLevel", "111")));
    act(() => api.updateBusiness({ phone: "222" }));
    expect(shown()).toBe("Edited In HighLevel|222");
  });
});
