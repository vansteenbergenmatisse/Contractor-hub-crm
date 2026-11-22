import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/features/app-shell", async () => {
  const { useReducer } = await import("react");
  return {
    usePushed: vi.fn(),
    useShell: () => ({}),
    useKeptReducer: (_key: string, r: never, a: never, i: never) => useReducer(r, a, i),
  };
});

import { MOCK_CUSTOM_VALUES, SettingsPage, initialState } from "@/features/settings";

// The route always passes the tenant's values (an empty record when they cannot be read).
const real = { business_name: "Test Co", main_color: "#112233" };

describe("Settings with a tenant's real values", () => {
  const html = renderToStaticMarkup(<SettingsPage initialValues={real} />);

  it("shows the real values", () => {
    expect(html).toContain('value="Test Co"');
    expect(html).toContain('value="#112233"');
  });

  it("puts no sample value in any field", () => {
    for (const [key, sample] of Object.entries(MOCK_CUSTOM_VALUES)) {
      if (!sample || key in real) continue;
      expect(html).not.toContain(`value="${sample}"`);
    }
  });

  it("shows no sample value with an empty record either", () => {
    const empty = renderToStaticMarkup(<SettingsPage initialValues={{}} />);
    for (const sample of Object.values(MOCK_CUSTOM_VALUES)) {
      if (sample) expect(empty).not.toContain(`value="${sample}"`);
    }
  });

  it("shows the choices as Not available yet, with no sample On switch", () => {
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain("Each switch works at once.");
    expect(html).toMatch(/Approve every quote before it goes out<\/p><\/div><\/div><div class="fd-rac"><span class="fd-chip is-plain">Not available yet<\/span>/);
    expect(html).toMatch(/Customers pick their own job date<\/p><\/div><\/div><div class="fd-rac"><span class="fd-chip is-plain">Not available yet<\/span>/);
  });

  it("keeps the sample switches out of the state", () => {
    expect(initialState(real).sw).toEqual([false, false]);
  });

  it("does not find a choice by a sample switch state when searching", () => {
    const out = renderToStaticMarkup(<SettingsPage initialValues={real} initial={{ ...initialState(real), q: "off" }} />);
    expect(out).not.toContain("Approve every quote before it goes out");
    expect(out).not.toContain("Customers pick their own job date");
  });

  it("keeps the fields and Save usable", () => {
    expect(html).toContain("Save changes");
    expect(html).toContain('id="cv-business_name"');
  });
});
