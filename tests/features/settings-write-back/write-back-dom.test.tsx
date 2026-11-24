// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
const updateBusiness = vi.fn();
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
import { SettingsPage } from "@/features/settings";
import { SettingsWriteBackPage } from "@/features/settings-write-back";

// Made-up values only.
const VALUES = { business_name: "Test Co", business_phone_number: "111", business_website_url: "https://a.test" };
const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const page = (writeBack = true) => {
  const Page = writeBack ? SettingsWriteBackPage : SettingsPage;
  return render(<PageStateProvider><Page initialValues={VALUES} initialSection="biz" /></PageStateProvider>);
};
const fetchMock = vi.fn<typeof fetch>();

async function changePhone(value = "222") {
  const user = userEvent.setup();
  const field = screen.getByLabelText(/^Phone/);
  await user.clear(field);
  await user.type(field, value);
  return { user, field };
}
// The line is always in the page and hidden by `is-off`.
const savedLineShown = () => waitFor(() => expect(document.querySelector(".fd-okl")).not.toHaveClass("is-off"));
const saveButton = () => screen.getByRole("button", { name: "Save Business" });

beforeEach(() => {
  fetchMock.mockReset();
  updateBusiness.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Settings with write-back off", () => {
  it("keeps the visit-only button and calls nothing", async () => {
    page(false);
    const { user } = await changePhone();
    await user.click(screen.getByRole("button", { name: "Apply Business" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Save Business" })).toBeNull();
  });
});

describe("Settings with write-back on", () => {
  it("sends only the changed value with what the owner started from", async () => {
    fetchMock.mockResolvedValue(answer({ results: [{ key: "business_phone_number", status: "saved" }] }));
    page();
    const { user } = await changePhone();
    await user.click(saveButton());
    await savedLineShown();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/settings/values");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ changes: [{ key: "business_phone_number", expected: "111", value: "222" }] });
    await waitFor(() => expect(updateBusiness).toHaveBeenCalled());
  });

  it("does not send a value the form refuses", async () => {
    page();
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText(/^Business name/));
    await user.click(saveButton());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getAllByText("Enter the business name.").length).toBeGreaterThan(0);
  });

  it("sends nothing when nothing changed", async () => {
    page();
    await userEvent.setup().click(saveButton());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps a failed value on screen as unsaved and says so", async () => {
    fetchMock.mockResolvedValue(answer({ results: [{ key: "business_phone_number", status: "retry" }] }));
    page();
    const { user, field } = await changePhone();
    await user.click(saveButton());
    await screen.findByText("Phone did not save. Try again.");
    expect(field).toHaveValue("222");
    expect(screen.queryByText("Saved to your account.")).toBeNull();
    expect(screen.getByText("You have changes that are not saved yet.")).toBeInTheDocument();
  });

  it("shows the value that changed in the account, and saving again starts from it", async () => {
    fetchMock.mockResolvedValueOnce(answer({ results: [{ key: "business_phone_number", status: "conflict", current: "999" }] }));
    fetchMock.mockResolvedValueOnce(answer({ results: [{ key: "business_phone_number", status: "saved" }] }));
    page();
    const { user } = await changePhone();
    await user.click(saveButton());
    await screen.findByText(/^Phone changed in your account to 999\./);
    await user.click(saveButton());
    await savedLineShown();
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).changes[0].expected).toBe("999");
  });

  it.each([[429, "Too many saves. Try again later."], [500, "Could not save. Nothing new was confirmed. Try again."]])("explains a %i", async (status, text) => {
    fetchMock.mockResolvedValue(answer({ error: "x" }, status));
    page();
    const { user } = await changePhone();
    await user.click(saveButton());
    await screen.findByText(text);
  });

  it("explains a network failure", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    page();
    const { user } = await changePhone();
    await user.click(saveButton());
    await screen.findByText("Could not save. Nothing new was confirmed. Try again.");
  });

  it("cannot be pressed twice while saving", async () => {
    let finish: (value: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    page();
    const { user } = await changePhone();
    await user.click(saveButton());
    const busy = screen.getByRole("button", { name: "Saving…" });
    expect(busy).toBeDisabled();
    await user.click(busy);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(answer({ results: [{ key: "business_phone_number", status: "saved" }] }));
    await savedLineShown();
  });
});
