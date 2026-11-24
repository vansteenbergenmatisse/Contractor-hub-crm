// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/leads",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
  useSearchParams: () => new URLSearchParams(""),
}));

import { AppShell, buildBusiness, PageStateProvider } from "@/features/app-shell";
import { leadFormAccess, LeadsPage, NewLeadDialog, type LeadFormAccess, type LeadsResult } from "@/features/leads";
import { requestNewLead } from "@/shared/lib/new-lead-event";

const ON: LeadFormAccess = { canSave: true, addressSearch: false };
const SEARCH: LeadFormAccess = { canSave: false, addressSearch: true };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const mount = (access?: LeadFormAccess) => render(<PageStateProvider><div className="fd-app"><NewLeadDialog access={access} /></div></PageStateProvider>);
async function fill(access?: LeadFormAccess) {
  const user = userEvent.setup();
  mount(access);
  act(() => { requestNewLead(); });
  const dialog = await screen.findByRole("dialog", { name: "New lead" });
  await user.type(within(dialog).getByLabelText("Name"), "Pat Test");
  await user.type(within(dialog).getByLabelText("Phone"), "6145550100");
  return { user, dialog };
}
const add = (user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) => user.click(within(dialog).getByRole("button", { name: "Add lead" }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  refresh.mockClear();
});

describe("who may save", () => {
  const env = { LEADS_CREATE_ENABLED: "true", LEADS_CREATE_TENANTS: "t1", GOOGLE_MAPS_SERVER_KEY: "k" };
  it("allows a listed tenant's owner and office", () => {
    expect(leadFormAccess({ role: "owner", tenantId: "t1" }, env)).toEqual({ canSave: true, addressSearch: true });
    expect(leadFormAccess({ role: "office", tenantId: "t1" }, env).canSave).toBe(true);
  });
  it.each([
    ["another tenant", { role: "owner", tenantId: "t2" }, false],
    ["View as client", { role: "admin", tenantId: "t1", viewing: true }, false],
    ["no user", null, false],
  ])("refuses %s", (_label, user, out) => expect(leadFormAccess(user, env).canSave).toBe(out));
  it("is off with the flag off, and search is off without a key", () => {
    expect(leadFormAccess({ role: "owner", tenantId: "t1" }, {})).toEqual({ canSave: false, addressSearch: false });
  });
});

describe("saving a lead", () => {
  it("posts once, shows it is working, then confirms and refreshes", async () => {
    let answer: (r: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { answer = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const { user, dialog } = await fill(ON);
    await add(user, dialog);
    const busy = within(dialog).getByRole("button", { name: "Adding..." });
    expect(busy).toHaveAttribute("aria-busy", "true");
    await user.click(busy);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/leads");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Pat Test", phone: "6145550100", email: "", address: "", source: "you" });
    await act(async () => { answer(json({ status: "created" })); });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("status")).toHaveTextContent("Lead saved to your CRM.");
    expect(refresh).toHaveBeenCalled();
  });

  it("cannot be closed while the save is on its way", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const { user, dialog } = await fill(ON);
    await add(user, dialog);
    await user.keyboard("{Escape}");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "New lead" })).toBeInTheDocument();
  });

  it.each([
    ["duplicate", json({ status: "duplicate" }), "already in your CRM"],
    ["in progress", json({ status: "in_progress" }), "already being saved"],
    ["unsure", json({ status: "unsure" }), "could not confirm"],
    ["failed", json({ status: "failed" }), "was not saved"],
    ["a server error", json({ error: "failed" }, 500), "could not confirm"],
    ["a rate limit", json({ error: "rate_limited" }, 429), "was not saved"],
  ])("keeps the draft and says so on %s", async (_label, response, text) => {
    vi.stubGlobal("fetch", vi.fn(async () => response));
    const { user, dialog } = await fill(ON);
    await add(user, dialog);
    expect(await within(dialog).findByText(new RegExp(text))).toHaveAttribute("role", "alert");
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Pat Test");
    expect(within(dialog).getByRole("button", { name: "Add lead" })).toBeInTheDocument();
  });

  it("treats a lost answer as unsure, never as failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    const { user, dialog } = await fill(ON);
    await add(user, dialog);
    expect(await within(dialog).findByText(/could not confirm/)).toHaveAttribute("role", "alert");
  });

  it("puts a phone the CRM refuses on the phone field", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ status: "invalid_phone" })));
    const { user, dialog } = await fill(ON);
    await add(user, dialog);
    expect(await within(dialog).findByText("Enter a full phone number with area code.")).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByLabelText("Phone")).toHaveFocus());
  });

  it("calls no server with saving off", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { user, dialog } = await fill();
    expect(dialog).toHaveTextContent("It stays on your Leads screen and is not saved.");
    await add(user, dialog);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the address search", () => {
  const suggestions = { suggestions: [{ id: "p1", text: "1 Main St, Columbus, OH" }, { id: "p2", text: "1 Main Ave, Dublin, OH" }] };

  it("is a plain field without a key and never calls the server", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { user, dialog } = await fill();
    const field = within(dialog).getByLabelText("Address (optional)");
    expect(field).not.toHaveAttribute("role");
    await user.type(field, "1 Main");
    await new Promise((r) => setTimeout(r, 300));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers suggestions as a combobox and picks one by keyboard without leaving the form", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(suggestions)));
    const { user, dialog } = await fill(SEARCH);
    const field = within(dialog).getByRole("combobox", { name: "Address (optional)" });
    await user.type(field, "1 Main");
    expect(await within(dialog).findByRole("option", { name: /Columbus/ })).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{ArrowDown}");
    expect(field.getAttribute("aria-activedescendant")).toBe(within(dialog).getByRole("option", { name: /Columbus/ }).id);
    await user.keyboard("{Enter}");
    expect(field).toHaveValue("1 Main St, Columbus, OH");
    expect(field).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("dialog", { name: "New lead" })).toBeInTheDocument();
  });

  it("Escape closes the list and leaves the dialog open", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(suggestions)));
    const { user, dialog } = await fill(SEARCH);
    await user.type(within(dialog).getByRole("combobox", { name: "Address (optional)" }), "1 Main");
    await within(dialog).findByRole("option", { name: /Columbus/ });
    await user.keyboard("{Escape}");
    expect(within(dialog).queryByRole("option", { name: /Columbus/ })).toBeNull();
    expect(screen.getByRole("dialog", { name: "New lead" })).toBeInTheDocument();
  });

  it("falls back to a plain field that keeps the text when search fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "unavailable" }, 502)));
    const { user, dialog } = await fill(SEARCH);
    await user.type(within(dialog).getByRole("combobox", { name: "Address (optional)" }), "1 Main");
    await waitFor(() => expect(within(dialog).queryByRole("combobox", { name: "Address (optional)" })).toBeNull());
    expect(within(dialog).getByLabelText("Address (optional)")).toHaveValue("1 Main");
  });
});

describe("where the lead came from", () => {
  it("is first in the phone sheet too", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    const ready: LeadsResult = { state: "ready", leads: [], loadedAt: "2026-03-04T12:00:00.000Z", complete: true, dropped: 0 };
    render(<AppShell business={buildBusiness({ name: "Sample Roofing", owner: "Pat Lee" })} searchRows={[]}><LeadsPage result={ready} timeZone="UTC" /></AppShell>);
    fireEvent.click(screen.getAllByRole("button", { name: "Add a lead" })[0]);
    const sheet = screen.getByRole("dialog", { name: "Add a lead by hand" });
    expect(sheet.querySelectorAll("select, input")[0]).toBe(within(sheet).getByLabelText("Where the lead came from"));
  });
});

describe("lead sources on a cut-off list", () => {
  const cut: LeadsResult = {
    state: "ready", loadedAt: "2026-03-04T12:00:00.000Z", complete: false, dropped: 0,
    leads: [
      { id: "a", name: "Pat One", source: "call", need: "", minutesWaiting: 0, address: "", status: "new", receivedAt: "2026-03-04T10:00:00.000Z" },
      { id: "b", name: "Pat Two", source: "fb", need: "", minutesWaiting: 0, address: "", status: "new", receivedAt: "2026-03-04T09:00:00.000Z" },
    ],
  };
  it("shows them as the newest N with every period, and no total", async () => {
    const user = userEvent.setup();
    render(<AppShell business={buildBusiness({ name: "Sample Roofing", owner: "Pat Lee" })} searchRows={[]}><LeadsPage result={cut} timeZone="UTC" /></AppShell>);
    const panel = screen.getByRole("region", { name: "Where your leads come from" });
    for (const name of ["All", "Today", "This week", "This month"]) {
      await user.click(within(panel).getByRole("button", { name }));
      expect(panel).toHaveTextContent("From your newest 2 leads. There may be more.");
      expect(panel).not.toHaveTextContent(/All 2 leads|The 2 leads/);
    }
  });
});

describe("an export whose answer never comes", () => {
  it("gives the button back and says what to check", () => {
    vi.useFakeTimers();
    vi.stubGlobal("cookieStore", new EventTarget());
    let jar = "";
    Object.defineProperty(document, "cookie", { configurable: true, get: () => jar, set: (v: string) => { jar = /Max-Age=0/.test(v) ? "" : v.split(";")[0]; } });
    const ready: LeadsResult = { state: "ready", leads: [], loadedAt: "2026-03-04T12:00:00.000Z", complete: true, dropped: 0 };
    render(<AppShell business={buildBusiness({ name: "Sample Roofing", owner: "Pat Lee" })} searchRows={[]}><LeadsPage result={ready} timeZone="UTC" viewer={{ role: "owner", hasTenant: true }} /></AppShell>);
    const region = within(screen.getByRole("region", { name: "Export leads" }));
    const button = region.getByRole("button", { name: "Export CSV" });
    const event = new Event("submit", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "submitter", { value: button });
    act(() => { button.closest("form")!.dispatchEvent(event); });
    expect(button).toHaveAttribute("aria-busy", "true");
    act(() => { vi.advanceTimersByTime(75_000); });
    expect(button).not.toHaveAttribute("aria-busy");
    expect(button).toHaveTextContent("Export CSV");
    expect(region.getByRole("alert")).toHaveTextContent("Check your downloads");
    delete (document as unknown as { cookie?: string }).cookie;
  });
});
