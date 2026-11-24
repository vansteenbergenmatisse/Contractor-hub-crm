// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/features/app-shell", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/app-shell")>();
  return {
    usePushed: () => {},
    useShell: () => ({ updateBusiness: vi.fn(), signOut: vi.fn() }),
    useKeptReducer: real.useKeptReducer,
    PageStateProvider: real.PageStateProvider,
  };
});

import { PageStateProvider } from "@/features/app-shell";
import { LINK_KEYS, SettingsPage, isSettingsKeyAllowed } from "@/features/settings";
import { folderIdOfKey } from "../../../src/features/settings/api/folders";

const KEYS = ["business_facebook_url", "business_instagram_url", "business_yelp_url", "business_youtube_url"];

afterEach(cleanup);

describe("the 01a_Social_Links folder", () => {
  it("allows its four keys, as links, in their own folder", () => {
    for (const key of KEYS) {
      expect(isSettingsKeyAllowed(key), key).toBe(true);
      expect(LINK_KEYS, key).toContain(key);
      expect(folderIdOfKey(key), key).toBe("social");
    }
  });

  it("shows an editable field for each, also when it is still empty", () => {
    const values = { business_name: "Test Co", business_facebook_url: "https://facebook.example/test", business_instagram_url: "", business_yelp_url: "", business_youtube_url: "" };
    render(<PageStateProvider><SettingsPage initialValues={values} initialSection="biz" account={{ imageHosts: [] }} /></PageStateProvider>);
    expect(screen.getByRole("heading", { level: 2, name: "Social links" })).toBeInTheDocument();
    for (const label of [/^Facebook/, /^Instagram/, /^Yelp/, /^YouTube/]) {
      const input = screen.getByLabelText(label) as HTMLInputElement;
      expect(input.readOnly).toBe(false);
      expect(input.disabled).toBe(false);
    }
  });
});
