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

// Made-up values only.
const VALUES = { business_owner_name: "Old Name" };
const wrapper = ({ children }: { children: ReactNode }) => <PageStateProvider>{children}</PageStateProvider>;
const saved = { type: "remoteSaved" as const, submitted: { business_owner_name: "New Name" }, results: [{ key: "business_owner_name", status: "saved" as const }] };

beforeEach(() => {
  updateBusiness.mockClear();
});
afterEach(cleanup);

describe("how long Settings asks the frame to hold a value", () => {
  it("marks a real save as expiring", () => {
    const { result } = renderHook(() => useSettings(undefined, VALUES, undefined, [], true), { wrapper });
    act(() => result.current.dispatch(saved));
    expect(updateBusiness).toHaveBeenCalledWith({ owner: "New Name" }, { expires: true });
  });

  it("leaves a visit-only edit without an expiry", () => {
    const { result } = renderHook(() => useSettings(undefined, VALUES, undefined, [], false), { wrapper });
    act(() => result.current.dispatch(saved));
    expect(updateBusiness).toHaveBeenCalledWith({ owner: "New Name" });
  });
});
