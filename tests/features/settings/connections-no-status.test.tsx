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

import * as settings from "@/features/settings";
import type { ConnectionStatus } from "@/features/settings";

const { SettingsPage, filterSettings, initialState } = settings;

const chips = (html: string) =>
  [...html.matchAll(/<span class="fd-chip (is-ok|is-plain)">(?:(?!<\/span><\/span>).)*<span class="fd-h">([^<]*)<\/span><\/span>/gs)]
    .map((m) => `${m[1]}:${m[2]}`);
const ASK = />Ask Forge Forward to connect</g;

describe("Settings connections with no real status", () => {
  const html = renderToStaticMarkup(<SettingsPage />);

  it("shows every row as Not available yet", () => {
    expect(chips(html)).toEqual(Array(6).fill("is-plain:Not available yet"));
    expect(html).not.toMatch(/fd-chip is-ok/);
    expect(html).not.toContain(">Not connected<");
    expect(html).not.toContain(">Connected<");
  });

  it("offers no action and no steps that imply a status", () => {
    expect(html.match(ASK)).toBeNull();
    expect(html).not.toContain("Noted on this screen");
    expect(html).not.toContain("fd-how");
    expect(html).not.toContain("A2P status:");
    expect(html).not.toContain("A2P verified. Your texts get delivered.");
  });

  it("has no How it works toggle on a row without a status", () => {
    expect(html).not.toContain("How it works");
    expect(html).not.toMatch(/class="fd-btn is-plain(?: is-off)?" aria-expanded/);
    const kept = renderToStaticMarkup(<SettingsPage initial={{ ...initialState(), how: { 2: true } }} />);
    expect(kept).not.toContain("fd-how");
    expect(kept).not.toContain(">Hide<");
    expect(kept.match(ASK)).toBeNull();
  });

  it("ignores an ask left in kept state while the status is unknown", () => {
    const out = renderToStaticMarkup(<SettingsPage initial={{ ...initialState(), asked: { 1: true }, how: { 1: true } }} />);
    expect(out).not.toContain("Noted on this screen");
  });

  it("does not let search find a row by a status it does not show", () => {
    const out = renderToStaticMarkup(<SettingsPage initial={{ ...initialState(), q: "not connected" }} />);
    expect(out).not.toContain(">Instagram<");
    expect(filterSettings("ask forge forward to connect").items["conn-0"]).toBe(false);
  });

  it("no longer exports made-up statuses", () => {
    expect("MOCK_CONNECTIONS" in settings).toBe(false);
  });
});

describe("Settings copy while a status is unknown", () => {
  const allOpen = { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true };
  const html = renderToStaticMarkup(<SettingsPage initial={{ ...initialState(), how: allOpen }} />);

  it("does not promise a status in an expanded row", () => {
    expect(html).not.toContain("Done when this row says Connected.");
    expect(html).not.toContain("Ask Forge Forward to connect it.");
    expect(html).not.toContain("This status cannot be shown yet.");
    expect(html).not.toContain("fd-rex");
  });

  it("shows no steps and nothing the owner would need to do", () => {
    expect(html).not.toContain("Sign in to Instagram in the window that opens.");
    expect(html).not.toContain("You need:");
    expect(html).not.toContain("fd-steps");
  });

  it("says plainly in the intro that statuses cannot be shown yet", () => {
    expect(html).not.toContain("A row that is not connected shows its steps.");
    expect(html).toContain("The status of each connection cannot be shown yet.");
    expect(html).not.toContain("What is linked to your dashboard.");
  });

  it("does not let search find an unknown row by the removed copy", () => {
    for (const q of ["done when this row", "ask forge forward to connect it", "sign in to instagram", "how it works", "you need"]) {
      const out = renderToStaticMarkup(<SettingsPage initial={{ ...initialState(), q }} />);
      expect(out).not.toContain(">Instagram<");
    }
  });

  it("keeps the current copy on rows with a real status", () => {
    const st: ConnectionStatus[] = [
      { state: "connected" }, { state: "unknown" }, { state: "not-connected" },
      { state: "unknown" }, { state: "connected" }, { state: "not-connected" },
    ];
    const out = renderToStaticMarkup(<SettingsPage connections={st} initial={{ ...initialState(), how: allOpen }} />);
    expect((out.match(/Done when this row says Connected\./g) ?? []).length).toBe(4);
    expect((out.match(/Ask Forge Forward to connect it\./g) ?? []).length).toBe(3);
    expect(out).not.toContain("This status cannot be shown yet.");
    expect(out).toContain("What is linked to your dashboard. A row that is not connected shows its steps.");
  });
});

describe("Settings connections with a real status", () => {
  it("renders connected, not-connected and unknown rows correctly", () => {
    const st: ConnectionStatus[] = [
      { state: "connected", a2pVerified: true }, { state: "unknown" }, { state: "not-connected" },
      { state: "unknown" }, { state: "connected", note: "Connected: Test Page" }, { state: "not-connected" },
    ];
    const out = renderToStaticMarkup(<SettingsPage connections={st} />);
    expect(chips(out)).toEqual([
      "is-ok:Connected", "is-plain:Not available yet", "is-plain:Not connected",
      "is-plain:Not available yet", "is-ok:Connected: Test Page", "is-plain:Not connected",
    ]);
    expect(out).toContain("A2P verified. Your texts get delivered.");
    expect(out.match(ASK)?.length).toBe(2);
    expect((out.match(/class="fd-rex fd-how"/g) ?? []).length).toBe(2);
  });
});
