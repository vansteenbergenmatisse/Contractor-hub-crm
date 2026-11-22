// @vitest-environment happy-dom
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/leads",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));
const published = vi.hoisted(() => ({ rows: [] as { id: string; name: string }[] }));
vi.mock("@/features/app-shell", async (original) => {
  const real = await original<typeof import("@/features/app-shell")>();
  return {
    ...real,
    PageAction: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    usePushed: () => {},
    useBusiness: () => real.buildBusiness({}),
    useSearchRows: (_page: string, rows: { id: string; name: string }[]) => {
      published.rows = rows;
    },
  };
});

import { PageStateProvider } from "../../../src/features/app-shell/components/PageState";
import { LeadsPage, LeadsSkeleton, type Lead, type LeadsResult } from "@/features/leads";
import { LeadRow } from "../../../src/features/leads/components/LeadRow";
import { MOCK_LEADS } from "../../../src/features/leads/mock";

const LOADED_AT = "2026-03-04T12:00:00.000Z";
const real = (over: Partial<Lead> = {}): Lead => ({ id: "c1", name: "Pat Test", source: "fb", need: "", minutesWaiting: 0, receivedAt: "2026-03-04T10:00:00.000Z", address: "1 Test St", status: "new", ...over });
const ready = (leads: Lead[], complete = true): LeadsResult => ({ state: "ready", leads, loadedAt: LOADED_AT, complete, dropped: 0 });
const sample = MOCK_LEADS.flatMap((l) => [l.name, l.address]);

afterEach(cleanup);

describe("real rendering", () => {
  it("shows real rows with no sample value, no wait chip and no old-leads panel", () => {
    const { container } = render(<LeadsPage result={ready([real()])} />);
    expect(screen.getByText("Pat Test")).toBeInTheDocument();
    for (const s of sample) expect(container.textContent).not.toContain(s);
    expect(container.querySelector(".fd-chip")).toBeNull();
    expect(container.textContent).not.toMatch(/waiting|Wait on you|no contact in 3 months|Nobody waits/);
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("keeps call and booking off on a real contact", () => {
    render(<LeadsPage result={ready([real()])} />);
    expect(screen.getByRole("button", { name: "Call Pat Test" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Book visit" })).toBeDisabled();
  });

  it("hides the tiles and the sources it cannot prove on a cut-off page", () => {
    const { container } = render(<LeadsPage result={ready([real()], false)} />);
    expect(container.querySelector(".fd-sumc")).toBeNull();
    expect(screen.queryByText("Where your leads come from")).toBeNull();
    expect(screen.getByText("Showing your newest lead.")).toBeInTheDocument();
  });

  it("publishes the loaded rows to the search", () => {
    render(<LeadsPage result={ready([real()])} />);
    expect(published.rows.map((r) => r.id)).toEqual(["c1"]);
  });

  it.each([
    ["empty", "No leads yet."],
    ["reconnect", "Your CRM connection needs attention."],
    ["unavailable", "Your leads can't load right now."],
  ] as const)("the %s state says so, with no row and no sample", (state, title) => {
    const { container } = render(<LeadsPage result={{ state }} />);
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(container.querySelector(".fd-rw")).toBeNull();
    for (const s of sample) expect(container.textContent).not.toContain(s);
  });

  it.each(["empty", "reconnect", "unavailable"] as const)("clears the published search rows when a refresh answers %s", (state) => {
    const { rerender } = render(<LeadsPage result={ready([real()])} />);
    expect(published.rows).toHaveLength(1);
    rerender(<LeadsPage result={{ state }} />);
    expect(published.rows).toEqual([]);
  });

  it("the skeleton holds no value", () => {
    const { container } = render(<LeadsSkeleton />);
    expect(screen.getByRole("status", { name: "Loading leads" })).toBeInTheDocument();
    expect(container.querySelector(".fd-lst")?.textContent).toBe("");
  });
});

describe("a refreshed lead", () => {
  it("renders a row with no stored status instead of crashing", () => {
    const noop = () => {};
    render(<LeadRow lead={real({ status: "follow" })} status={undefined} main={false} onCall={noop} onReply={noop} onBook={noop} />);
    expect(screen.getByText("Following up")).toBeInTheDocument();
  });

  it("merges fresh rows into state kept by the shell", () => {
    let refresh: (r: LeadsResult) => void = () => {};
    function Page() {
      const [result, set] = useState(ready([real()]));
      refresh = set;
      return <LeadsPage result={result} />;
    }
    render(<PageStateProvider><Page /></PageStateProvider>);
    act(() => refresh(ready([real({ id: "c2", name: "Sam Fresh" }), real()])));
    expect(within(document.querySelector('[data-row-id="c2"]') as HTMLElement).getByText("Sam Fresh")).toBeInTheDocument();
    expect(published.rows.map((r) => r.id)).toEqual(["c2", "c1"]);
  });
});

describe("no sample data in production code", () => {
  it("nothing in the feature imports the mock file", () => {
    const root = join(process.cwd(), "src/features/leads");
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : [];
    });
    for (const f of walk(root)) expect(readFileSync(f, "utf8"), f).not.toMatch(/from\s+["'][^"']*mock["']/);
  });
});
