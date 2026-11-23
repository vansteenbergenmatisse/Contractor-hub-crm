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
const VALUES = { business_owner_name: "Saved Name", business_phone_number: "111" };
const wrapper = ({ children }: { children: ReactNode }) => <PageStateProvider>{children}</PageStateProvider>;

beforeEach(() => {
  updateBusiness.mockClear();
});
afterEach(cleanup);

describe("coming back to Settings after a save", () => {
  it("does not put the old save over the frame again", () => {
    renderHook(() => useSettings({ ...initialState(VALUES), ok: true }, undefined, undefined, []), { wrapper });
    expect(updateBusiness).not.toHaveBeenCalled();
  });

  it("still updates the frame for a new save", () => {
    const { result } = renderHook(() => useSettings(undefined, VALUES, undefined, []), { wrapper });
    act(() => result.current.dispatch({ type: "remoteSaved", submitted: { business_owner_name: "New Name" }, results: [{ key: "business_owner_name", status: "saved" }] }));
    expect(updateBusiness).toHaveBeenCalledTimes(1);
    expect(updateBusiness.mock.calls[0][0]).toMatchObject({ owner: "New Name" });
  });

  it("updates the frame for a save made after coming back", () => {
    const { result } = renderHook(() => useSettings({ ...initialState(VALUES), ok: true }, undefined, undefined, []), { wrapper });
    act(() => result.current.dispatch({ type: "remoteSaved", submitted: { business_owner_name: "Newer Name" }, results: [{ key: "business_owner_name", status: "saved" }] }));
    expect(updateBusiness).toHaveBeenCalledTimes(1);
    expect(updateBusiness.mock.calls[0][0]).toMatchObject({ owner: "Newer Name" });
  });
});
