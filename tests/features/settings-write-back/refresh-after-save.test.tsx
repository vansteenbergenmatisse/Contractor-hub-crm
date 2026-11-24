// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), refresh }),
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
import { SettingsWriteBackPage } from "@/features/settings-write-back";

// Made-up values only.
const VALUES = { business_name: "Test Co", business_phone_number: "111", business_website_url: "https://a.test" };
const fetchMock = vi.fn<typeof fetch>();
const reply = (status: string) =>
  new Response(JSON.stringify({ results: [{ key: "business_phone_number", status }] }), { status: 200, headers: { "content-type": "application/json" } });

async function saveOnce(response: Response) {
  fetchMock.mockResolvedValue(response);
  render(<PageStateProvider><SettingsWriteBackPage initialValues={VALUES} initialSection="biz" /></PageStateProvider>);
  const user = userEvent.setup();
  const field = screen.getByLabelText(/^Phone/);
  await user.clear(field);
  await user.type(field, "222");
  await user.click(screen.getByRole("button", { name: "Save Business" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByRole("button", { name: "Save Business" })).toBeEnabled());
}

beforeEach(() => {
  fetchMock.mockReset();
  refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the frame after a save", () => {
  it("re-renders from the server after a saved value", async () => {
    await saveOnce(reply("saved"));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("re-renders after an unconfirmed value, so the frame shows what the account holds", async () => {
    await saveOnce(reply("unknown"));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("does not re-render when nothing was written", async () => {
    await saveOnce(reply("rejected"));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not re-render when the request failed", async () => {
    await saveOnce(new Response("{}", { status: 500 }));
    expect(refresh).not.toHaveBeenCalled();
  });
});
