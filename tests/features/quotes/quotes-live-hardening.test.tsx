// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/quotes",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => null,
}));

import type { EstimateRow, EstimatesRead } from "@/features/highlevel";
import { QuotesLivePage, loadQuotes } from "@/features/quotes";

// All values are fake.
const row: EstimateRow = { id: "e1", name: "Spring cleanup", contactName: "Pat Test", status: "sent", amount: 10, currency: "USD", issuedMs: Date.UTC(2026, 2, 4) };
const answer = (extra: Partial<Extract<EstimatesRead, { ok: true }>> = {}): EstimatesRead => ({ ok: true, rows: [row], total: 1, dropped: 0, complete: true, ...extra });

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("foreign rows", () => {
  it("is unavailable and logs the count only", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await loadQuotes("tenant-a", async () => answer({ foreign: 2, dropped: 2, total: 3 }));
    expect(out).toEqual({ state: "unavailable" });
    const logged = [...warn.mock.calls, ...error.mock.calls].flat().join(" ");
    expect(logged).toContain("2");
    expect(logged).not.toMatch(/tenant-a|e1|Pat Test|Spring/);
  });

  it("stays ready with a foreign count of zero", async () => {
    expect((await loadQuotes("tenant-a", async () => answer({ foreign: 0 }))).state).toBe("ready");
  });
});

describe("kill switch", () => {
  it.each([[" true"], ["true "], ["\ttrue\n"]])("turns the read off for %j", async (value) => {
    vi.stubEnv("QUOTES_READ_DISABLED", value);
    const read = vi.fn();
    expect(await loadQuotes("tenant-a", read)).toEqual({ state: "unavailable" });
    expect(read).not.toHaveBeenCalled();
  });

  it("stays on for any other value", async () => {
    vi.stubEnv("QUOTES_READ_DISABLED", "false");
    expect((await loadQuotes("tenant-a", async () => answer())).state).toBe("ready");
  });
});

describe("amount wording", () => {
  it("makes no claim about how amounts are recorded", async () => {
    const result = await loadQuotes("tenant-a", async () => answer());
    const { container } = render(<QuotesLivePage result={result} />);
    expect(container.textContent).not.toMatch(/exactly as your CRM/i);
    expect(container.textContent).toContain("10");
  });
});
