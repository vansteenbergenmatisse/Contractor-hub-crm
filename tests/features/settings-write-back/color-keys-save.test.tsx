// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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
import { COLOR_KEYS } from "@/features/settings";
import { SettingsWriteBackPage } from "@/features/settings-write-back";
import { FOLDERS } from "../../../src/features/settings/api/folders";

// The brand colors are the 02_Branding custom values, each written under its own key. Made-up values.
const OLD: Record<string, string> = Object.fromEntries(COLOR_KEYS.map((key) => [key, key === "text_on_main_color" ? "#ffffff" : "#111111"]));
const NEW: Record<string, string> = Object.fromEntries(COLOR_KEYS.map((key) => [key, key === "text_on_main_color" ? "#fefefe" : "#222222"]));
const fetchMock = vi.fn<typeof fetch>();
const answer = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("brand colors", () => {
  it("are the keys of the 02_Branding folder", () => {
    expect(FOLDERS.find((folder) => folder.name === "02_Branding")?.keys).toEqual(COLOR_KEYS);
  });

  it("a color save sends exactly the color keys, each with its own value", async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      const { changes } = JSON.parse(String(init?.body)) as { changes: { key: string }[] };
      return answer({ results: changes.map(({ key }) => ({ key, status: "saved" })) });
    });
    render(<PageStateProvider><SettingsWriteBackPage initialValues={{ business_name: "Test Co", business_phone_number: "111", ...OLD }} initialSection="colors" /></PageStateProvider>);
    for (const key of COLOR_KEYS) fireEvent.change(document.getElementById(`cv-${key}`) as HTMLInputElement, { target: { value: NEW[key] } });
    fireEvent.click(screen.getByRole("button", { name: "Save Brand colors" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const changes = fetchMock.mock.calls.flatMap(([, init]) => (JSON.parse(String(init?.body)) as { changes: { key: string; expected: string; value: string }[] }).changes);
    expect(changes.map((c) => c.key).sort()).toEqual([...COLOR_KEYS].sort());
    for (const change of changes) {
      expect(change.value).toBe(NEW[change.key]);
      expect(change.expected).toBe(OLD[change.key]);
    }
  });
});
