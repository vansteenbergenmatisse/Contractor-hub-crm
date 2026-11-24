// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let search = new URLSearchParams("");
vi.mock("next/navigation", () => ({
  usePathname: () => "/leads",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => search,
}));

import { AppShell, buildBusiness } from "@/features/app-shell";
import { createContactCreateAdapter, type ContactCreateRequests } from "@/features/highlevel";
import { LeadsPage, NewLeadDialog, canExportLeads, type Lead, type LeadsResult } from "@/features/leads";
import { requestNewLead } from "@/shared/lib/new-lead-event";

const NOW = new Date("2026-03-04T12:00:00.000Z");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const row = (id: string) => ({ id, dateAdded: "2026-03-04T10:00:00.000Z", firstName: "P" });
const rows = (n: number, prefix = "a") => Array.from({ length: n }, (_, i) => row(`${prefix}${i}`));

const read = (answer: (page: number) => unknown) => {
  const searchCall = vi.fn(async (_t: string, _l: string, page: number) => json(answer(page)));
  const requests: ContactCreateRequests = { duplicate: vi.fn(), create: vi.fn(), search: searchCall };
  const api = createContactCreateAdapter({ readLocationId: async () => "loc", withToken: async (_t, call) => call("token"), requests });
  return { searchCall, out: api.readForExport("t") };
};

beforeEach(() => {
  search = new URLSearchParams("");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("export completeness", () => {
  it("does not call a short page complete when the total says more", async () => {
    const { out } = read((page) => (page === 1 ? { contacts: rows(50), total: 500 } : { contacts: [], total: 500 }));
    expect(await out).toMatchObject({ ok: true, complete: false });
  });
  it("does not call a short page complete when hasMore is true", async () => {
    const { out } = read((page) => (page === 1 ? { contacts: rows(50), hasMore: true } : { contacts: [] }));
    expect(await out).toMatchObject({ ok: true, complete: false });
  });
  it("reads on after a short page that the total says is not the last", async () => {
    const { out } = read((page) => (page === 1 ? { contacts: rows(50), total: 80 } : { contacts: rows(30, "b"), total: 80 }));
    const answer = await out;
    expect(answer).toMatchObject({ ok: true, complete: true });
    if (answer.ok) expect(answer.contacts).toHaveLength(80);
  });
  it("is complete on an exact last page of 100 with a matching total", async () => {
    const { out, searchCall } = read(() => ({ contacts: rows(100), total: 100 }));
    expect(await out).toMatchObject({ ok: true, complete: true });
    expect(searchCall).toHaveBeenCalledTimes(1);
  });
  it("is complete on an exact 100 without a total once the next page is empty", async () => {
    const { out, searchCall } = read((page) => ({ contacts: page === 1 ? rows(100) : [] }));
    expect(await out).toMatchObject({ ok: true, complete: true });
    expect(searchCall).toHaveBeenCalledTimes(2);
  });
  it("is not complete at the 5-page cap", async () => {
    const { out, searchCall } = read((page) => ({ contacts: rows(100, `p${page}-`), total: 900 }));
    const answer = await out;
    expect(answer).toMatchObject({ ok: true, complete: false });
    if (answer.ok) expect(answer.contacts).toHaveLength(500);
    expect(searchCall).toHaveBeenCalledTimes(5);
  });
  it("is not complete when the page parameter is ignored", async () => {
    const { out, searchCall } = read(() => ({ contacts: rows(100) }));
    expect(await out).toMatchObject({ ok: true, complete: false });
    expect(searchCall).toHaveBeenCalledTimes(2);
  });
  it.each([["text", "500"], ["negative", -1], ["fraction", 1.5]])("is not complete on a malformed total (%s)", async (_label, total) => {
    const { out } = read(() => ({ contacts: rows(10), total }));
    expect(await out).toMatchObject({ ok: true, complete: false });
  });
});

describe("who gets the export control", () => {
  it.each([
    [{ role: "owner", hasTenant: true }, true],
    [{ role: "office", hasTenant: true }, false],
    [{ role: "admin", hasTenant: true }, false],
    [{ role: "owner", hasTenant: true, viewing: true }, false],
    [{ role: "owner", hasTenant: false }, false],
    [null, false],
  ])("%j is %s", (user, out) => expect(canExportLeads(user)).toBe(out));
});

const lead = (): Lead => ({ id: "c1", name: "Pat Test", source: null, need: "", minutesWaiting: 0, address: "", status: "new", receivedAt: "2026-03-04T11:00:00.000Z" });
const result: LeadsResult = { state: "ready", leads: [lead()], loadedAt: NOW.toISOString(), complete: true, dropped: 0 };
const shell = (children: React.ReactNode) => <AppShell business={buildBusiness({ name: "Sample Roofing", owner: "Pat Lee" })} searchRows={[]}>{children}</AppShell>;
const page = (canExport?: boolean) => render(shell(<LeadsPage result={result} timeZone="UTC" viewer={canExport ? { role: "owner", hasTenant: true } : { role: "office", hasTenant: true }} />));

describe("the export control", () => {
  it("is absent unless the server allows it", () => {
    page();
    expect(screen.queryByRole("button", { name: "Export CSV" })).toBeNull();
  });
  it("posts natively to the route with the contact box off by default", () => {
    page(true);
    const button = screen.getByRole("button", { name: "Export CSV" });
    const form = button.closest("form")!;
    expect(form.getAttribute("method")?.toLowerCase()).toBe("post");
    expect(form.getAttribute("action")).toBe("/api/leads/export");
    const box = screen.getByRole("checkbox", { name: "Include phone, email and address" });
    expect(box).not.toBeChecked();
    expect(box).toHaveAttribute("name", "includeContact");
    expect(box).toHaveAttribute("value", "1");
  });
  it.each([["busy", "Too many exports. Try again later."], ["failed", "The export did not work. Try again."]])("shows the %s answer", (code, message) => {
    search = new URLSearchParams(`export=${code}`);
    page(true);
    expect(within(screen.getByRole("region", { name: "Export leads" })).getByRole("alert")).toHaveTextContent(message);
  });
  it("ignores an unknown answer in the address", () => {
    search = new URLSearchParams("export=<b>x</b>");
    page(true);
    expect(within(screen.getByRole("region", { name: "Export leads" })).queryByRole("alert")).toBeNull();
  });
});

describe("the source after adding a lead", () => {
  it("goes back to Added by you, so the next lead is not counted under the last source", async () => {
    const user = userEvent.setup();
    page();
    const side = document.querySelector<HTMLElement>(".fd-side2")!;
    const source = within(side).getByLabelText("Where the lead came from") as HTMLSelectElement;
    await user.selectOptions(source, "Facebook");
    await user.type(within(side).getByLabelText("Name"), "Pat");
    await user.type(within(side).getByLabelText("Phone"), "6145550100");
    await user.click(within(side).getByRole("button", { name: "Add lead" }));
    await waitFor(() => expect((within(side).getByLabelText("Where the lead came from") as HTMLSelectElement).value).toBe("you"));
  });
  it("keeps the chosen source when the form has an error", async () => {
    const user = userEvent.setup();
    page();
    const side = document.querySelector<HTMLElement>(".fd-side2")!;
    await user.selectOptions(within(side).getByLabelText("Where the lead came from"), "Facebook");
    await user.click(within(side).getByRole("button", { name: "Add lead" }));
    expect((within(side).getByLabelText("Where the lead came from") as HTMLSelectElement).value).toBe("fb");
  });
});

describe("leaving the New lead dialog", () => {
  it("has a stylesheet rule that shows Cancel in the dialog at every width", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(/\.fd-app \[data-new-lead-dialog\] \.fx-addx\{display:flex\}/);
  });
  it("Cancel closes it and gives the focus back", async () => {
    const user = userEvent.setup();
    render(shell(<><button type="button" data-testid="opener">Open</button><NewLeadDialog /></>));
    const opener = screen.getByTestId("opener");
    opener.focus();
    requestNewLead();
    const dialog = await screen.findByRole("dialog", { name: "New lead" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
