// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/leads",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

import { AppShell, buildBusiness } from "@/features/app-shell";
import { LeadsPage, type LeadsResult } from "@/features/leads";

const ready: LeadsResult = {
  state: "ready", loadedAt: "2026-03-04T12:00:00.000Z", complete: true, dropped: 0,
  leads: [{ id: "c1", name: "Pat Test", source: null, need: "", minutesWaiting: 0, address: "", status: "new", receivedAt: "2026-03-04T10:00:00.000Z" }],
};
const panel = () => (
  <AppShell business={buildBusiness({ name: "Sample Roofing", owner: "Pat Lee" })} searchRows={[]}>
    <LeadsPage result={ready} timeZone="UTC" viewer={{ role: "owner", hasTenant: true }} />
  </AppShell>
);

describe("the export panel", () => {
  const store = new EventTarget();
  const finish = (value: string) => act(() => {
    store.dispatchEvent(Object.assign(new Event("change"), { changed: [{ name: "leads-export-result", value: `${value}.id` }] }));
  });
  const region = () => within(screen.getByRole("region", { name: "Export leads" }));
  const button = () => region().getByRole("button", { name: /^Export/ }) as HTMLButtonElement;
  const submit = () => {
    const event = new Event("submit", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "submitter", { value: button() });
    act(() => { button().closest("form")!.dispatchEvent(event); });
    return event;
  };
  let jar = "";

  beforeEach(() => {
    jar = "";
    vi.stubGlobal("cookieStore", store);
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => jar,
      set: (v: string) => { jar = /Max-Age=0/.test(v) ? "" : v.split(";")[0]; },
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    delete (document as unknown as { cookie?: string }).cookie;
  });

  it("asks to stay on the page only at submit, keeping the plain form for no JavaScript", () => {
    render(panel());
    expect(button().closest("form")!.getAttribute("action")).toBe("/api/leads/export");
    expect(button().getAttribute("formaction")).toBeNull();
    submit();
    expect(button().getAttribute("formaction")).toBe("/api/leads/export?respond=stay");
  });
  it("sends one request on a double submit and shows it is working", () => {
    render(panel());
    expect(submit().defaultPrevented).toBe(false);
    expect(button()).toHaveAttribute("aria-busy", "true");
    expect(button()).toHaveTextContent("Exporting");
    expect(submit().defaultPrevented).toBe(true);
  });
  it("recovers after success", () => {
    render(panel());
    submit();
    finish("ok");
    expect(button()).toHaveTextContent("Export CSV");
    expect(button()).not.toHaveAttribute("aria-busy");
    expect(region().queryByRole("alert")).toBeNull();
    expect(submit().defaultPrevented).toBe(false);
  });
  it("shows the reason in place after a limit, then clears it on retry", () => {
    render(panel());
    submit();
    finish("busy");
    expect(region().getByRole("alert")).toHaveTextContent("Too many exports. Try again later.");
    expect(button()).toHaveTextContent("Export CSV");
    submit();
    expect(region().queryByRole("alert")).toBeNull();
  });
  it("names a refused export", () => {
    render(panel());
    submit();
    finish("forbidden");
    expect(region().getByRole("alert")).toHaveTextContent("This account cannot export leads from here.");
  });
  it("ignores a result when nothing is pending", () => {
    render(panel());
    finish("failed");
    expect(region().queryByRole("alert")).toBeNull();
  });
  it("falls back to the plain post when the cookie cannot be used, so it can never stick", () => {
    Object.defineProperty(document, "cookie", { configurable: true, get: () => "", set: () => {} });
    render(panel());
    expect(submit().defaultPrevented).toBe(false);
    expect(button().getAttribute("formaction")).toBeNull();
    expect(button()).not.toHaveAttribute("aria-busy");
  });
  it("keeps the rest of the page mounted through a failed export", () => {
    render(<div><input aria-label="Draft" defaultValue="unsaved" />{panel()}</div>);
    const draft = screen.getByLabelText("Draft");
    submit();
    finish("busy");
    expect(screen.getByLabelText("Draft")).toBe(draft);
    expect(draft).toHaveValue("unsaved");
  });
});
