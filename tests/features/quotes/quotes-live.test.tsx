// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/quotes",
  useRouter: () => ({ push: vi.fn(), refresh }),
  useSearchParams: () => null,
}));

import type { EstimateRow, EstimatesRead } from "@/features/highlevel";
import { QuotesLivePage, loadQuotes, type QuotesResult } from "@/features/quotes";

// All values are fake.
const NOW = new Date("2026-03-04T17:00:00.000Z");
const row = (over: Partial<EstimateRow> = {}): EstimateRow => ({
  id: "e1", name: "Spring cleanup", contactName: "Pat Test", status: "sent", amount: 1222.03, currency: "USD", issuedMs: Date.parse("2026-03-04T00:00:00.000Z"), ...over,
});
const ok = (rows: EstimateRow[], extra: Partial<Extract<EstimatesRead, { ok: true }>> = {}): EstimatesRead => ({ ok: true, rows, total: rows.length, dropped: 0, complete: true, ...extra });
const load = (read: EstimatesRead, tenant: string | null = "tenant-a") => loadQuotes(tenant, vi.fn(async () => read), () => NOW);
const ready = async (rows: EstimateRow[], extra: Partial<Extract<EstimatesRead, { ok: true }>> = {}) => {
  const out = await load(ok(rows, extra));
  if (out.state !== "ready") throw new Error(`not ready: ${out.state}`);
  return out;
};

afterEach(() => {
  cleanup();
  refresh.mockClear();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("loadQuotes", () => {
  it("is unavailable with no tenant and makes no read", async () => {
    const read = vi.fn();
    expect(await loadQuotes(null, read)).toEqual({ state: "unavailable" });
    expect(read).not.toHaveBeenCalled();
  });

  it("is off with the server kill switch and makes no read", async () => {
    vi.stubEnv("QUOTES_READ_DISABLED", "true");
    const read = vi.fn();
    expect(await loadQuotes("tenant-a", read)).toEqual({ state: "unavailable" });
    expect(read).not.toHaveBeenCalled();
  });

  it("passes on reconnect and unavailable, and survives a thrown read", async () => {
    expect(await load({ ok: false, reason: "reconnect" })).toEqual({ state: "reconnect" });
    expect(await load({ ok: false, reason: "unavailable" })).toEqual({ state: "unavailable" });
    expect(await loadQuotes("t", async () => { throw new Error("x"); })).toEqual({ state: "unavailable" });
  });

  it("is empty only when nothing can be hidden", async () => {
    expect(await load(ok([]))).toEqual({ state: "empty" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await load(ok([], { dropped: 1, total: 1 }))).toEqual({ state: "unavailable" });
    expect(await load(ok([], { complete: false, total: 4 }))).toEqual({ state: "unavailable" });
  });

  it("puts the newest quote first and undated quotes last", async () => {
    const out = await ready([row({ id: "none", issuedMs: null }), row({ id: "old", issuedMs: 1000 }), row({ id: "new", issuedMs: 2000 })]);
    expect(out.quotes.map((q) => q.id)).toEqual(["new", "old", "none"]);
  });

  it("shows the amount exactly as received, adds no symbol, and never sums", async () => {
    const out = await ready([row({ amount: 122203, currency: null })]);
    expect(out.quotes[0]).toMatchObject({ amountText: "122203", currency: null });
    expect(JSON.stringify(out)).not.toContain("$");
    expect(out).not.toHaveProperty("sum");
  });
});

describe("QuotesLivePage", () => {
  const show = (r: QuotesResult) => render(<QuotesLivePage result={r} />);

  it("shows the real quote with its status, amount and stated currency", async () => {
    const { container } = show(await ready([row()]));
    expect(screen.getByRole("heading", { level: 1, name: "Quotes" })).toBeTruthy();
    const text = container.textContent ?? "";
    expect(text).toContain("Pat Test");
    expect(text).toContain("Spring cleanup");
    expect(text).toContain("Sent");
    expect(text).toContain("1222.03");
    expect(text).toContain("Currency USD");
    expect(text).toContain("Issued Mar 4, 2026");
    expect(text).not.toContain("$");
    expect(container.querySelector(".fd-rw .fd-ram")).not.toBeNull();
  });

  it("says when an amount or a currency is missing, and invents neither", async () => {
    const { container } = show(await ready([row({ amount: null, currency: null, status: null })]));
    const text = container.textContent ?? "";
    expect(text).toContain("No amount");
    expect(text).not.toContain("Currency");
    expect(container.querySelector(".fd-chip")).toBeNull();
  });

  it("has no control that can send, approve, build, upload or edit", async () => {
    const { container } = show(await ready([row({ status: "draft" }), row({ id: "e2", status: "sent" })]));
    expect(container.querySelectorAll("button, input, select, textarea, form, a[href]").length).toBe(0);
    expect(container.textContent).not.toMatch(/Approve and send|Build quote|upload your own|AI builds/i);
    expect(container.textContent).toContain("view only");
  });

  it("shows no sample quote", async () => {
    const { container } = show(await ready([row()]));
    expect(container.textContent).not.toMatch(/Linda Park|Tom Becker|Paul Ortega/);
  });

  it("says when the list is cut off or rows were left out", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { container } = show(await ready([row()], { total: 500, complete: false, dropped: 2 }));
    expect(container.textContent).toContain("Showing 1 of 500 quotes");
    expect(container.textContent).toContain("2 quotes could not be read");
  });

  it("shows the empty, reconnect and unavailable states", () => {
    show({ state: "empty" });
    expect(screen.getByRole("status").textContent).toContain("No quotes yet");
    cleanup();
    show({ state: "reconnect" });
    expect(screen.getByRole("alert").textContent).toContain("needs attention");
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();
    show({ state: "unavailable" });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
