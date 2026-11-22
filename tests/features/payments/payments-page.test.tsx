import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/payments",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { MOCK_PAYMENTS, PaymentsPage, PaymentsView, initialState, markPaid, remind, searchRows } from "@/features/payments";

const html = renderToStaticMarkup(<PaymentsPage />);
const view = (rows = MOCK_PAYMENTS, state = initialState(rows)) =>
  renderToStaticMarkup(<PaymentsView rows={rows} state={state} onRemind={() => {}} onPaid={() => {}} onUndo={() => {}} />);

describe("PaymentsPage", () => {
  it("renders the title, the numbers and every invoice without the view wrapper", () => {
    expect(html).toContain("Payments due");
    expect(html).toContain("$23,750");
    expect(html).toContain("2 late");
    expect(html).toContain("Paid today");
    for (const r of MOCK_PAYMENTS) expect(html).toContain(r.name);
    expect(html).not.toContain("fd-view");
    expect(html).not.toContain("data-pg");
  });

  it("colors the chips by lateness", () => {
    expect(html).toMatch(/fd-chip is-hot/);
    expect(html).toMatch(/fd-chip is-bad/);
    expect(html).toMatch(/fd-chip is-warn/);
  });

  it("says online payments are not available yet and links to /settings", () => {
    expect(html).toContain("Not available yet");
    expect(html).toMatch(/<a[^>]*href="\/settings"[^>]*>Connect in Settings<\/a>/);
  });

  it("offers Call, Remind now and Mark paid per open invoice, no Undo and no empty state", () => {
    expect((html.match(/>Remind now</g) ?? []).length).toBe(3);
    expect((html.match(/>Mark paid</g) ?? []).length).toBe(3);
    expect((html.match(/Call [A-Z]/g) ?? []).length).toBe(3);
    expect(html).not.toContain(">Undo<");
    expect(html).not.toContain("Nobody owes you money");
  });

  it("exports search rows that link to /payments", () => {
    expect(searchRows.length).toBeGreaterThan(0);
    expect(searchRows.every((r) => r.href === "/payments" && r.page === "payments")).toBe(true);
  });
});

describe("PaymentsView states", () => {
  it("shows the reminder line and Undo after Remind now", () => {
    const out = view(MOCK_PAYMENTS, remind(initialState(MOCK_PAYMENTS), MOCK_PAYMENTS[1].id));
    expect(out).toContain("Reminder sent just now");
    expect((out.match(/>Undo</g) ?? []).length).toBe(1);
  });

  it("shows a paid row with Undo, stopped reminders and updated totals", () => {
    const out = view(MOCK_PAYMENTS, markPaid(initialState(MOCK_PAYMENTS), MOCK_PAYMENTS[0].id));
    expect(out).toContain("fd-rw is-done");
    expect(out).toContain("Paid just now");
    expect(out).toContain("Reminders stopped");
    expect(out).toContain("$14,350");
    expect(out).toContain("$9,400");
    expect((out.match(/>Mark paid</g) ?? []).length).toBe(2);
  });

  it("shows the empty state when everything is paid", () => {
    const all = MOCK_PAYMENTS.reduce((s, r) => markPaid(s, r.id), initialState(MOCK_PAYMENTS));
    expect(view(MOCK_PAYMENTS, all)).toContain("Nobody owes you money.");
  });

  it("shows the empty state for no invoices", () => {
    expect(view([], {})).toContain("Nobody owes you money.");
  });
});

describe("no automation, no network", () => {
  it("has no fetch, XMLHttpRequest or HighLevel call in the feature source", () => {
    const root = join(process.cwd(), "src/features/payments");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name)) files.push(p);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|setInterval|setTimeout|highlevel|leadconnector/i);
    }
  });
});
