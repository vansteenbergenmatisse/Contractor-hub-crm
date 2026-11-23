// @vitest-environment happy-dom
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import { AppShell, type Business } from "@/features/app-shell";
import { calendarTimeZone, type CalendarResult } from "@/features/calendar";
import { InboxLivePage, loadInbox, type InboxReader, type InboxResult } from "@/features/inbox";
import { createInitialState, LeadsPage, tiles, weekKnown, type Lead, type LeadsResult } from "@/features/leads";
import { loadPipeline, type PipelineBoardAnswer } from "@/features/pipeline";
import { LeadsCard, LeadsTile } from "@/features/today";
import { useLiveBoard } from "../../../src/features/pipeline/hooks/use-live-board";

afterEach(cleanup);

// All values are fake.
const LOADED_AT = "2026-03-04T12:00:00.000Z";
const lead = (id: string, receivedAt: string | null = "2026-03-04T02:00:00.000Z"): Lead => ({
  id, name: `Test ${id}`, source: null, need: "", minutesWaiting: 0, receivedAt: receivedAt as string, address: "", status: "new",
});
const ready = (leads: Lead[], over: Partial<Extract<LeadsResult, { state: "ready" }>> = {}): LeadsResult => ({
  state: "ready", leads, loadedAt: LOADED_AT, complete: true, dropped: 0, ...over,
});

describe("L1: the Inbox badge counts unread conversations", () => {
  const business = { name: "Test Co", initials: "TC", phone: "", city: "", tag: "", site: "" } as unknown as Business;
  const inbox = (result: InboxResult) => <AppShell business={business} searchRows={[]}><InboxLivePage result={result} /></AppShell>;
  const conversations = [
    { id: "a", name: "Pat Test", channel: null, snippet: "", unreadCount: 3 },
    { id: "b", name: "Sam Test", channel: null, snippet: "", unreadCount: 1 },
    { id: "c", name: "Lee Test", channel: null, snippet: "", unreadCount: 0 },
  ];
  const loaded: InboxResult = { state: "ready", conversations, complete: true, dropped: 0, selectedId: null, thread: null };

  it("shows the number of conversations with unread messages and says unread", () => {
    const { container } = render(inbox(loaded));
    const badge = container.querySelector(".fd-badge");
    expect(badge?.textContent).toBe("2");
    expect(badge?.getAttribute("aria-label")).toBe("2 unread");
    expect(container.innerHTML).not.toContain("need a reply");
  });

  it("hides the badge again when the Inbox can no longer say", () => {
    const { container, rerender } = render(inbox(loaded));
    rerender(inbox({ state: "unavailable" }));
    expect(container.querySelector(".fd-badge")?.className).toContain("is-off");
  });
});

describe("L2: leads use the location's time zone", () => {
  // 02:00 UTC on Mar 4 is still Mar 3 in New York.
  it("counts New today in the location's zone when it is known", () => {
    const html = renderToStaticMarkup(<LeadsTile result={ready([lead("1")])} timeZone="America/New_York" />);
    expect(html).toContain("New leads: 0 today");
    const card = renderToStaticMarkup(<LeadsCard result={ready([lead("1")])} range="today" onRange={() => {}} timeZone="America/New_York" />);
    expect(card).toContain("<b>0</b> new today");
  });

  it("keeps the viewer's zone when the location's is unknown", () => {
    const viewer = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const expected = renderToStaticMarkup(<LeadsTile result={ready([lead("1")])} timeZone={viewer} />);
    expect(renderToStaticMarkup(<LeadsTile result={ready([lead("1")])} timeZone={null} />)).toBe(renderToStaticMarkup(<LeadsTile result={ready([lead("1")])} />));
    expect(expected).toContain("New leads:");
  });

  it("the Leads page uses the zone it is given", () => {
    const business = { name: "Test Co", initials: "TC", phone: "", city: "", tag: "", site: "" } as unknown as Business;
    const { container } = render(<AppShell business={business} searchRows={[]}><LeadsPage result={ready([lead("1")])} timeZone="America/New_York" /></AppShell>);
    const tile = [...container.querySelectorAll(".fd-smt")].find((el) => el.textContent?.includes("New today"));
    expect(tile?.querySelector(".fd-smv")?.textContent).toBe("0");
  });

  it("reads the zone from a calendar result, and only when it has one", () => {
    const week = { timeZone: "America/Chicago" };
    expect(calendarTimeZone({ state: "empty", week, reason: "no-appointments" } as unknown as CalendarResult)).toBe("America/Chicago");
    expect(calendarTimeZone({ state: "unavailable" })).toBeNull();
    expect(calendarTimeZone({ state: "reconnect" })).toBeNull();
  });
});

describe("L3: a cut-off read never reads as empty", () => {
  const reader = (over: Partial<InboxReader>): InboxReader => ({
    list: async () => ({ ok: true, conversations: [{ id: "a", name: "Pat", lastMessageBody: null, lastMessageType: null, unreadCount: 0 }], dropped: 0, complete: true }),
    thread: async () => ({ ok: true, messages: [], dropped: 0, complete: true }),
    ...over,
  });

  it("a thread cut off with no message row is unavailable", async () => {
    const out = await loadInbox("t", reader({ thread: async () => ({ ok: true, messages: [], dropped: 0, complete: false }) }), "inbox-a");
    expect(out.state === "ready" && out.thread).toEqual({ state: "unavailable" });
  });

  it("a finished thread with no message is still empty", async () => {
    const out = await loadInbox("t", reader({}), "inbox-a");
    expect(out.state === "ready" && out.thread).toEqual({ state: "empty" });
  });

  it("a list cut off with no row is unavailable", async () => {
    const out = await loadInbox("t", reader({ list: async () => ({ ok: true, conversations: [], dropped: 0, complete: false }) }), null);
    expect(out).toEqual({ state: "unavailable" });
  });
});

describe("L4: Today says when its lead list is partial", () => {
  const note = "Some leads may be missing from this list.";
  const html = (result: LeadsResult) => renderToStaticMarkup(<LeadsCard result={result} range="today" onRange={() => {}} timeZone="UTC" />);

  it("says so when the rows cannot be proven whole", () => {
    expect(html(ready([lead("1", "2026-03-04T11:00:00.000Z")], { complete: false }))).toContain(note);
  });

  it("stays quiet when the count is proven", () => {
    expect(html(ready([lead("1", "2026-03-04T11:00:00.000Z")]))).not.toContain(note);
  });
});

describe("L5: malformed rows never produce an exact count", () => {
  const context = { loadedAt: LOADED_AT, complete: true, timeZone: "UTC" };

  it("hides both counts when a row has no usable date", () => {
    const rows = [lead("1"), lead("2", "not a date")];
    expect(tiles(rows, createInitialState(rows), context)).toMatchObject({ today: null, week: null });
    expect(weekKnown(rows, LOADED_AT, true)).toBe(false);
  });

  it("hides both counts when rows were left out", () => {
    const rows = [lead("1")];
    expect(tiles(rows, createInitialState(rows), { ...context, dropped: 1 })).toMatchObject({ today: null, week: null });
    expect(weekKnown(rows, LOADED_AT, true, 1)).toBe(false);
  });

  it("still counts clean rows", () => {
    const rows = [lead("1")];
    expect(tiles(rows, createInitialState(rows), context)).toMatchObject({ today: 1, week: 1 });
  });
});

describe("L6: Pipeline survives fewer stages", () => {
  const column = (id: string) => ({ id, name: id, cards: [] });

  it("keeps the stage in range when the stages shrink", () => {
    const { result, rerender } = renderHook(({ columns }) => useLiveBoard(columns), { initialProps: { columns: [column("a"), column("b"), column("c")] } });
    act(() => result.current.pick(2));
    expect(result.current.stage).toBe(2);
    rerender({ columns: [column("a")] });
    expect(result.current).toMatchObject({ stage: 0, isFirst: true, isLast: true });
  });

  it("a pipeline with deals but no stages is unavailable, not a crash", async () => {
    const answer = {
      ok: true, pipelines: [{ id: "p", name: "Sales", stages: [] }], pipelineId: "p", dropped: 0, complete: true,
      opportunities: [{ id: "o", name: "Job", contactName: null, stageId: "gone", monetaryValue: null, lastStageChangeAt: null }],
    } as unknown as PipelineBoardAnswer;
    expect(await loadPipeline("t", async () => answer)).toEqual({ state: "unavailable" });
  });
});

describe("L8: time in stage", () => {
  const since = async (changedAt: string) => {
    const answer = {
      ok: true, pipelines: [{ id: "p", name: "Sales", stages: [{ id: "s", name: "First" }] }], pipelineId: "p", dropped: 0, complete: true,
      opportunities: [{ id: "o", name: "Job", contactName: null, stageId: "s", monetaryValue: null, lastStageChangeAt: changedAt }],
    } as unknown as PipelineBoardAnswer;
    const out = await loadPipeline("t", async () => answer, undefined, () => new Date("2026-03-10T12:00:00.000Z"));
    return out.state === "ready" ? out.columns[0].cards[0].since : null;
  };

  it("does not call a change 23 hours ago today", async () => {
    expect(await since("2026-03-09T13:00:00.000Z")).toBe("Under 1 day in this stage");
  });

  it("still says today for a change earlier the same day", async () => {
    expect(await since("2026-03-10T11:00:00.000Z")).toBe("In this stage today");
  });
});
