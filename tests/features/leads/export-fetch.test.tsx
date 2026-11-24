// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
const ExportPanel = () => (
  <AppShell business={buildBusiness({ name: "Sample Roofing", owner: "Pat Lee" })} searchRows={[]}>
    <LeadsPage result={ready} timeZone="UTC" viewer={{ role: "owner", hasTenant: true }} />
  </AppShell>
);

const FAILED = "The export did not work. Try again.";
const csv = (name = "leads-2026-03-04.csv") => new Response("Name\r\nPat\r\n", {
  status: 200,
  headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"` },
});
const json = (status: number) => new Response(JSON.stringify({ error: "x" }), { status, headers: { "content-type": "application/json" } });

const region = () => within(screen.getByRole("region", { name: "Export leads" }));
const button = () => region().getByRole("button", { name: /^Export/ }) as HTMLButtonElement;
const settle = () => act(async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); });
const page = () => render(<div><input aria-label="Draft" defaultValue="unsaved" /><ExportPanel /></div>);

describe("the export with fetch and a blob", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let saved: { name: string; href: string }[];
  let submitted: number;
  const onSubmit = () => { submitted += 1; };

  beforeEach(() => {
    saved = [];
    submitted = 0;
    fetchMock = vi.fn(async () => csv());
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ name: this.download, href: this.href });
    });
    document.addEventListener("submit", onSubmit);
  });
  afterEach(() => {
    document.removeEventListener("submit", onSubmit);
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("downloads the file under the server's name and stays on the page", async () => {
    fetchMock.mockResolvedValueOnce(csv("leads-partial-newest-5-2026-03-04.csv"));
    page();
    fireEvent.click(button());
    await settle();
    expect(saved).toEqual([{ name: "leads-partial-newest-5-2026-03-04.csv", href: "blob:export" }]);
    expect(submitted).toBe(0);
    expect(button()).toHaveTextContent("Export CSV");
    expect(region().queryByRole("alert")).toBeNull();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/leads/export");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(JSON.parse(init.body)).toEqual({ includeContact: false });
  });
  it("sends the contact choice", async () => {
    page();
    fireEvent.click(region().getByRole("checkbox"));
    fireEvent.click(button());
    await settle();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ includeContact: true });
  });
  it.each([
    [403, "This account cannot export leads from here."],
    [429, "Too many exports. Try again later."],
    [500, FAILED],
    [502, FAILED],
  ])("keeps the draft and shows the reason on %i", async (status, message) => {
    fetchMock.mockResolvedValueOnce(json(status));
    page();
    const draft = screen.getByLabelText("Draft");
    fireEvent.click(button());
    await settle();
    expect(region().getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText("Draft")).toBe(draft);
    expect(draft).toHaveValue("unsaved");
    expect(saved).toEqual([]);
    expect(submitted).toBe(0);
    expect(button()).toHaveTextContent("Export CSV");
  });
  it("does not save a 200 that is not a CSV", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }));
    page();
    fireEvent.click(button());
    await settle();
    expect(saved).toEqual([]);
    expect(region().getByRole("alert")).toHaveTextContent(FAILED);
  });
  it("recovers from a lost connection", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network"));
    page();
    fireEvent.click(button());
    await settle();
    expect(region().getByRole("alert")).toHaveTextContent(FAILED);
    expect(button()).not.toHaveAttribute("aria-busy");
  });
  it("aborts at the timeout and frees the button, even if the body never ends", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce(async (_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return { status: 200, headers: new Headers({ "content-type": "text/csv" }), blob: () => new Promise(() => {}) };
    });
    page();
    fireEvent.click(button());
    await settle();
    expect(button()).toHaveAttribute("aria-busy", "true");
    await act(async () => { await vi.advanceTimersByTimeAsync(75_000); });
    expect(signal?.aborted).toBe(true);
    expect(button()).not.toHaveAttribute("aria-busy");
    expect(region().getByRole("alert")).toHaveTextContent(FAILED);
  });
  it("sends one request on a double click, and allows another afterwards", async () => {
    let finish: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    page();
    fireEvent.click(button());
    fireEvent.click(button());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(submitted).toBe(0);
    expect(button()).toHaveTextContent("Exporting");
    finish(csv());
    await settle();
    fireEvent.click(button());
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("aborts when the panel goes away", async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise<Response>(() => {});
    });
    const view = page();
    fireEvent.click(button());
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });
  it("keeps the no-JavaScript form", () => {
    page();
    const form = button().closest("form")!;
    expect(form.getAttribute("method")).toBe("post");
    expect(form.getAttribute("action")).toBe("/api/leads/export");
  });
});
