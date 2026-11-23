// @vitest-environment happy-dom
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), refresh, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { AppShell, buildBusiness, useShell, type ShellApi } from "@/features/app-shell";

// Made-up values only.
const server = (owner: string, phone = "111") => buildBusiness({ name: "Sample Co", owner, phone });
const latest: { current: ShellApi | null } = { current: null };
const update = (patch: Parameters<ShellApi["updateBusiness"]>[0]) => act(() => latest.current?.updateBusiness(patch, { expires: true }));
const visitEdit = (patch: Parameters<ShellApi["updateBusiness"]>[0]) => act(() => latest.current?.updateBusiness(patch));
function Probe() {
  const shell = useShell();
  useEffect(() => {
    latest.current = shell;
  });
  return <output data-testid="probe">{`${shell.business.owner}|${shell.business.phone}`}</output>;
}
const frame = (business: ReturnType<typeof server>) => <AppShell business={business} searchRows={[]}><Probe /></AppShell>;
const shown = () => screen.getByTestId("probe").textContent;
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the age limit of a saved value on the frame", () => {
  it("holds the value just under a minute", async () => {
    render(frame(server("Old Name")));
    update({ owner: "New Name" });
    await advance(59_999);
    expect(shown()).toBe("New Name|111");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("lets go after a minute and asks the server, when HighLevel went back to the old value", async () => {
    render(frame(server("Old Name")));
    update({ owner: "New Name" });
    await advance(60_000);
    expect(shown()).toBe("Old Name|111");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("ages each field from its own save", async () => {
    render(frame(server("Old Name", "111")));
    update({ owner: "New Name" });
    await advance(40_000);
    update({ phone: "222" });
    await advance(20_000);
    expect(shown()).toBe("Old Name|222");
    await advance(40_000);
    expect(shown()).toBe("Old Name|111");
  });

  it("keeps a visit-only edit past the limit, without asking the server", async () => {
    render(frame(server("Old Name")));
    visitEdit({ owner: "Visit Name" });
    await advance(600_000);
    expect(shown()).toBe("Visit Name|111");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not expire a visit-only edit made over an earlier save", async () => {
    render(frame(server("Old Name")));
    update({ owner: "Saved Name" });
    await advance(10_000);
    visitEdit({ owner: "Visit Name" });
    await advance(120_000);
    expect(shown()).toBe("Visit Name|111");
  });

  it("sets no timer once the server has shown the save", async () => {
    const view = render(frame(server("Old Name")));
    update({ owner: "New Name" });
    view.rerender(frame(server("New Name")));
    await advance(120_000);
    expect(shown()).toBe("New Name|111");
    expect(refresh).not.toHaveBeenCalled();
  });
});
