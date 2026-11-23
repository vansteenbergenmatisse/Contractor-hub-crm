// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
const { updateBusiness } = vi.hoisted(() => ({ updateBusiness: vi.fn() }));
vi.mock("@/features/app-shell", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/app-shell")>();
  return {
    usePushed: () => {},
    useShell: () => ({ updateBusiness, signOut: vi.fn() }),
    useKeptReducer: real.useKeptReducer,
    PageStateProvider: real.PageStateProvider,
  };
});

import { PageStateProvider } from "@/features/app-shell";
import { useSettings } from "../../../src/features/settings/hooks/use-settings";
import { initialState } from "../../../src/features/settings/api/state";

// Made-up values only.
const VALUES = { business_owner_name: "Old Name", business_phone_number: "111", main_color: "#111111" };
const wrapper = ({ children }: { children: ReactNode }) => <PageStateProvider>{children}</PageStateProvider>;
const mainColor = () => document.documentElement.style.getPropertyValue("--main-color");
const saved = (key: string, value: string) => ({ type: "remoteSaved" as const, submitted: { [key]: value }, results: [{ key, status: "saved" as const }] });

beforeEach(() => {
  updateBusiness.mockClear();
  document.documentElement.style.removeProperty("--main-color");
  document.getElementById("settings-brand-live")?.remove();
});
afterEach(cleanup);

describe("what a save puts on the frame", () => {
  it("patches only the field that changed, so a kept phone cannot cover a newer one", () => {
    const { result } = renderHook(() => useSettings(undefined, VALUES, undefined, []), { wrapper });
    act(() => result.current.dispatch(saved("business_owner_name", "New Name")));
    expect(updateBusiness).toHaveBeenCalledTimes(1);
    expect(updateBusiness).toHaveBeenCalledWith({ owner: "New Name" });
  });

  it("patches only the newest change on a second save", () => {
    const { result } = renderHook(() => useSettings(undefined, VALUES, undefined, []), { wrapper });
    act(() => result.current.dispatch(saved("business_owner_name", "New Name")));
    act(() => result.current.dispatch(saved("business_phone_number", "222")));
    expect(updateBusiness).toHaveBeenLastCalledWith({ phone: "222" });
  });
});

describe("colors when coming back to Settings", () => {
  it("does not put a kept save's colors on the page again", () => {
    renderHook(() => useSettings({ ...initialState(VALUES), ok: true }, undefined, undefined, []), { wrapper });
    expect(mainColor()).toBe("");
  });

  it("applies the colors of a save made after coming back", () => {
    const { result } = renderHook(() => useSettings({ ...initialState(VALUES), ok: true }, undefined, undefined, []), { wrapper });
    act(() => result.current.dispatch(saved("main_color", "#222222")));
    expect(mainColor()).toBe("#222222");
  });
});
