// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const nav = vi.hoisted(() => ({ search: "", refresh: vi.fn(), rows: [] as unknown[] }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/pipeline",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: nav.refresh }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/features/app-shell", async (original) => ({
  ...(await original<typeof import("@/features/app-shell")>()),
  useSearchRows: (_page: string, rows: unknown[]) => {
    nav.rows = rows;
  },
  PageAction: ({ children }: { children: React.ReactNode }) => <div data-testid="action">{children}</div>,
}));

import { LivePipelinePage, LivePipelineSkeleton, type PipelineResult } from "@/features/pipeline";

// All values are fake.
const card = (id: string, name: string) => ({ id, name, init: "FN", detail: "Fake job", amount: "500", since: "2 days in this stage" });
const ready = (stages = 2): PipelineResult => ({
  state: "ready",
  pipelines: [{ id: "p1", name: "Sales" }, { id: "p2", name: "Other" }],
  pipelineId: "p1",
  columns: Array.from({ length: stages }, (_, i) => ({ id: `s${i}`, name: `Stage ${i}`, cards: i === 0 ? [card("o1", "Pat Test")] : i === stages - 1 ? [card("o9", "Sam Fake")] : [] })),
  loadedAt: "2026-03-10T12:00:00.000Z",
  complete: true,
  dropped: 0,
});
const board = () => document.querySelector<HTMLElement>(".fd-kb")!;
const article = (name: string) => document.querySelector<HTMLElement>(`article[aria-label="${name}"]`);

beforeEach(() => {
  nav.search = "";
  nav.rows = [];
  nav.refresh.mockClear();
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => cleanup());

describe("LivePipelinePage, ready", () => {
  it("draws the tenant's stages and cards with the design's board classes", () => {
    render(<LivePipelinePage result={ready()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Pipeline" })).toHaveClass("fd-pt");
    expect(board()).toHaveClass("is-g0", "is-st0");
    expect(article("Pat Test")).toHaveClass("fd-kc", "is-s0", "is-r0");
    expect(article("Sam Fake")).toHaveClass("is-s1");
    expect(article("Pat Test")).toHaveAttribute("data-row-id", "pipeline-o1");
    expect(within(article("Pat Test")!).getByText("500")).toBeInTheDocument();
    expect(within(article("Pat Test")!).getByText("2 days in this stage")).toBeInTheDocument();
  });

  it("offers no working write: every card's Move is disabled and the page says why", () => {
    render(<LivePipelinePage result={ready()} />);
    const buttons = within(article("Pat Test")!).getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toBeDisabled();
    expect(buttons[0]).toHaveAccessibleName("Move Pat Test: not available yet");
    expect(screen.getByText(/can start an automation/)).toBeInTheDocument();
    expect(document.querySelector('[draggable="true"]')).toBeNull();
    for (const label of ["Book visit", "Send quote", "Mark paid", "Undo"]) expect(screen.queryByRole("button", { name: label })).toBeNull();
  });

  it("handles more stages than one view: the second group of columns uses the same five slots", async () => {
    const user = userEvent.setup();
    render(<LivePipelinePage result={ready(7)} />);
    expect(article("Sam Fake")).toBeNull();
    await user.click(screen.getByRole("button", { name: /^Stages 6-7/ }));
    expect(board()).toHaveClass("is-g0", "is-st0");
    expect(article("Sam Fake")).toHaveClass("is-s1");
    expect(article("Pat Test")).toBeNull();
  });

  it("opens one stage on a phone and goes back to the list", async () => {
    const user = userEvent.setup();
    render(<LivePipelinePage result={ready(3)} />);
    await user.click(screen.getAllByRole("button", { name: /Stage 2/ }).find((b) => b.classList.contains("fd-sti"))!);
    expect(board()).toHaveClass("is-open", "is-st2");
    await user.click(screen.getByRole("button", { name: "Stages" }));
    expect(board()).not.toHaveClass("is-open");
  });

  it("links to the tenant's other pipelines and marks the current one", () => {
    render(<LivePipelinePage result={ready()} />);
    const switcher = screen.getByRole("navigation", { name: "Pipelines" });
    expect(within(switcher).getByRole("link", { name: "Sales" })).toHaveAttribute("aria-current", "page");
    expect(within(switcher).getByRole("link", { name: "Other" })).toHaveAttribute("href", "/pipeline?pipeline=p2");
  });

  it("hides the switcher when the tenant has one pipeline", () => {
    render(<LivePipelinePage result={{ ...ready(), pipelines: [{ id: "p1", name: "Sales" }] } as PipelineResult} />);
    expect(screen.queryByRole("navigation", { name: "Pipelines" })).toBeNull();
  });

  it("says when the list is cut off or rows were left out", () => {
    render(<LivePipelinePage result={{ ...ready(), complete: false, dropped: 2 } as PipelineResult} />);
    expect(screen.getByRole("status")).toHaveTextContent("Not every deal is shown");
    expect(screen.getByRole("status")).toHaveTextContent("2 deals could not be read");
  });

  it("gives the shell search one row per card, staying on this pipeline", () => {
    render(<LivePipelinePage result={ready()} />);
    expect(nav.rows).toEqual([
      { id: "pipeline-o1", page: "pipeline", name: "Pat Test", sub: "Fake job · Stage 0", href: "/pipeline?pipeline=p1" },
      { id: "pipeline-o9", page: "pipeline", name: "Sam Fake", sub: "Fake job · Stage 1", href: "/pipeline?pipeline=p1" },
    ]);
  });

  it("opens the stage of a card named by ?row=, also in a later group", async () => {
    nav.search = "?row=pipeline-o9";
    render(<LivePipelinePage result={ready(7)} />);
    await waitFor(() => expect(article("Sam Fake")).not.toBeNull());
    expect(board()).toHaveClass("is-open", "is-st1");
  });
});

describe("LivePipelinePage, other states", () => {
  it("empty is calm and keeps the pipeline switcher", () => {
    render(<LivePipelinePage result={{ state: "empty", pipelines: [{ id: "p1", name: "Sales" }, { id: "p2", name: "Other" }], pipelineId: "p1" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("No open deals");
    expect(screen.getByRole("link", { name: "Other" })).toBeInTheDocument();
    expect(document.querySelector("article")).toBeNull();
  });

  it("reconnect says what to do and has no retry", () => {
    render(<LivePipelinePage result={{ state: "reconnect" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Ask your account admin to reconnect it");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("unavailable offers a read-only retry", async () => {
    const user = userEvent.setup();
    render(<LivePipelinePage result={{ state: "unavailable" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Nothing was changed");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(nav.refresh).toHaveBeenCalledTimes(1);
  });

  it.each(["unavailable", "reconnect"] as const)("%s clears the search rows and shows no sample customer", (state) => {
    nav.rows = [{ id: "stale" }];
    render(<LivePipelinePage result={{ state }} />);
    expect(nav.rows).toEqual([]);
    expect(document.body.textContent).not.toContain("Maria Alvarez");
  });

  it("the skeleton shows no value", () => {
    render(<LivePipelineSkeleton />);
    expect(screen.getByRole("status", { name: "Loading pipeline" })).toHaveAttribute("aria-busy", "true");
    expect(document.querySelector("article")).toBeNull();
  });
});
