import { describe, expect, it } from "vitest";
import { addLeadMode, filterKeyIndex, rowWhen, waitText } from "../../../src/features/leads/api/leads-logic";
import {
  createInitialState,
  filterCounts,
  firstNeedId,
  isWaiting,
  leadsReducer,
  MOCK_LEADS,
  searchRows,
  sourceRows,
  summarize,
  tiles,
  validateLead,
  visibleAdded,
  visibleLeads,
  waitClass,
  waitLevel,
  type LeadsAction,
  type LeadsState,
} from "@/features/leads";

const run = (state: LeadsState, ...actions: LeadsAction[]) => actions.reduce(leadsReducer, state);
const fresh = () => createInitialState(MOCK_LEADS);
const fill = (s: LeadsState, v: Partial<Record<"name" | "phone" | "email" | "addr" | "need", string>>) =>
  run(s, ...Object.entries(v).map(([field, value]) => ({ type: "field", field, value }) as LeadsAction));

describe("wait chip", () => {
  it("is amber under 1 hour, light red from 1 to 24 hours, full red from 24 hours", () => {
    expect(waitLevel(0)).toBe("warn");
    expect(waitLevel(59)).toBe("warn");
    expect(waitLevel(60)).toBe("bad");
    expect(waitLevel(1439)).toBe("bad");
    expect(waitLevel(1440)).toBe("hot");
    expect(waitClass(59)).toBe("is-warn");
    expect(waitClass(60)).toBe("is-bad");
    expect(waitClass(1440)).toBe("is-hot");
  });
});

describe("status transitions", () => {
  it("Call marks a lead called and it stops waiting", () => {
    const s = run(fresh(), { type: "call", id: "ld-1" });
    expect(s.status["ld-1"]).toBe("called");
    expect(isWaiting(s.status["ld-1"])).toBe(false);
  });

  it("Book visit books, Undo booking returns to the first status", () => {
    const booked = run(fresh(), { type: "book", id: "ld-1" });
    expect(booked.status["ld-1"]).toBe("booked");
    expect(run(booked, { type: "book", id: "ld-1" }).status["ld-1"]).toBe("call");
    expect(run(fresh(), { type: "book", id: "ld-2" }, { type: "book", id: "ld-2" }).status["ld-2"]).toBe("reply");
  });

  it("undoing a lead that started booked falls back to Following up", () => {
    expect(run(fresh(), { type: "book", id: "ld-4" }).status["ld-4"]).toBe("follow");
  });

  it("an unknown id changes nothing", () => {
    const s = fresh();
    expect(run(s, { type: "call", id: "nope" }).status).toEqual(s.status);
  });
});

describe("filters and counts", () => {
  it("counts all, and the waiting ones per level", () => {
    expect(filterCounts(MOCK_LEADS, fresh())).toEqual({ all: 8, warn: 1, bad: 1, hot: 1 });
  });

  it("counts drop when a lead is called", () => {
    const s = run(fresh(), { type: "call", id: "ld-3" });
    expect(filterCounts(MOCK_LEADS, s)).toEqual({ all: 8, warn: 1, bad: 1, hot: 0 });
  });

  it("shows only the waiting leads of the chosen level", () => {
    const s = run(fresh(), { type: "filter", filter: "hot" });
    expect(visibleLeads(MOCK_LEADS, s).map((l) => l.id)).toEqual(["ld-3"]);
    expect(visibleLeads(MOCK_LEADS, run(s, { type: "filter", filter: "all" }))).toHaveLength(8);
  });

  it("shows nothing (the empty state) when the chosen level has no waiting lead left", () => {
    const s = run(fresh(), { type: "filter", filter: "hot" }, { type: "call", id: "ld-3" });
    expect(visibleLeads(MOCK_LEADS, s)).toHaveLength(0);
    expect(visibleAdded(s)).toHaveLength(0);
    expect(filterCounts(MOCK_LEADS, s).hot).toBe(0);
  });

  it("the first waiting lead carries the filled button", () => {
    expect(firstNeedId(MOCK_LEADS, fresh())).toBe("ld-1");
    expect(firstNeedId(MOCK_LEADS, run(fresh(), { type: "call", id: "ld-1" }))).toBe("ld-2");
    const none = run(fresh(), { type: "call", id: "ld-1" }, { type: "call", id: "ld-2" }, { type: "call", id: "ld-3" });
    expect(firstNeedId(MOCK_LEADS, none)).toBeNull();
  });
});

describe("summary line", () => {
  it("names the lead that waits longest and offers one button", () => {
    const s = summarize(MOCK_LEADS, fresh());
    expect(s).toMatchObject({ tone: "hot", a: "3 leads wait on you.", b: "Ellen waits longest: 2 days.", button: "Call Ellen" });
    expect(s.target).toEqual({ id: "ld-3", kind: "call" });
  });

  it("says Reply to when the longest wait is a text", () => {
    const s = summarize(MOCK_LEADS, run(fresh(), { type: "call", id: "ld-3" }, { type: "call", id: "ld-1" }));
    expect(s).toMatchObject({ tone: "bad", a: "1 lead waits on you.", b: "Jordan waits 1 hr.", button: "Reply to Jordan" });
    expect(s.target).toEqual({ id: "ld-2", kind: "reply" });
  });

  it("is calm when nobody waits", () => {
    const s = summarize(MOCK_LEADS, run(fresh(), { type: "call", id: "ld-1" }, { type: "call", id: "ld-2" }, { type: "call", id: "ld-3" }));
    expect(s).toMatchObject({ tone: "calm", a: "Nobody waits on you.", button: "", target: null });
  });

  it("counts a hand-added lead and, alone, says you added it just now", () => {
    let s = run(fresh(), { type: "call", id: "ld-1" }, { type: "call", id: "ld-2" }, { type: "call", id: "ld-3" });
    s = run(fill(s, { name: "Pat", phone: "6145550100" }), { type: "submit" });
    expect(summarize(MOCK_LEADS, s)).toMatchObject({ tone: "warn", a: "1 lead waits on you.", b: "You added them just now.", button: "", target: null });
    expect(summarize(MOCK_LEADS, run(fresh(), { type: "submit" })).a).toBe("3 leads wait on you.");
  });
});

describe("Add a lead", () => {
  it("rejects an empty name first and puts the cursor there", () => {
    const s = run(fresh(), { type: "submit" });
    expect(s.errors).toEqual({ name: "Enter a name.", phone: "Enter a phone number.", email: "" });
    expect(s.focus?.field).toBe("name");
    expect(s.added).toHaveLength(0);
  });

  it("validates each field with its own message and cursor target", () => {
    expect(validateLead({ name: "", phone: "", email: "", addr: "", need: "" }).focus).toBe("name");
    const phone = validateLead({ name: "Pat", phone: "12-34", email: "", addr: "", need: "" });
    expect(phone).toMatchObject({ errors: { name: "", phone: "Enter a phone number.", email: "" }, focus: "phone" });
    const mail = validateLead({ name: "Pat", phone: "(614) 555-0100", email: "pat@", addr: "", need: "" });
    expect(mail).toMatchObject({ errors: { name: "", phone: "", email: "That email looks off. Check it for a typo." }, focus: "email" });
    const ok = validateLead({ name: " Pat ", phone: "614 555 0100", email: "pat@example.com", addr: "", need: "" });
    expect(ok.focus).toBeNull();
  });

  it("needs at least 7 digits in the phone, and ignores spaces in the name", () => {
    expect(validateLead({ name: "  ", phone: "1234567", email: "", addr: "", need: "" }).errors.name).toBe("Enter a name.");
    expect(validateLead({ name: "A", phone: "123456", email: "", addr: "", need: "" }).errors.phone).not.toBe("");
    expect(validateLead({ name: "A", phone: "1234567", email: "", addr: "", need: "" }).errors.phone).toBe("");
  });

  it("repeats the focus when the same field fails twice", () => {
    const a = run(fresh(), { type: "submit" });
    const b = run(a, { type: "submit" });
    expect(b.focus?.tick).toBeGreaterThan(a.focus?.tick ?? 0);
  });

  it("adds the lead on top, clears the form, closes the sheet and resets the filter", () => {
    let s = run(fresh(), { type: "openAdd" }, { type: "filter", filter: "hot" });
    s = fill(s, { name: "Pat Lee", phone: "6145550100", email: "pat@example.com", addr: "5 Oak St", need: "Gutters" });
    s = run(s, { type: "submit" });
    expect(s.sheet).toBe(false);
    expect(s.filter).toBe("all");
    expect(s.added[0]).toMatchObject({ name: "Pat Lee", sub: "Gutters · 6145550100 · pat@example.com · 5 Oak St" });
    expect(s.form).toEqual({ name: "", phone: "", email: "", addr: "", need: "" });
    expect(s.errors).toEqual({ name: "", phone: "", email: "" });
    s = run(fill(s, { name: "Second", phone: "6145550101" }), { type: "submit" });
    expect(s.added.map((a) => a.name)).toEqual(["Second", "Pat Lee"]);
    expect(s.added[0].sub).toBe("New lead · 6145550101");
    expect(new Set(s.added.map((a) => a.id)).size).toBe(2);
  });

  it("closing clears the errors and keeps what was typed", () => {
    let s = run(fresh(), { type: "openAdd" }, { type: "field", field: "name", value: "Pat" }, { type: "submit" });
    expect(s.errors.phone).not.toBe("");
    s = run(s, { type: "closeAdd" });
    expect(s.sheet).toBe(false);
    expect(s.errors).toEqual({ name: "", phone: "", email: "" });
    expect(s.form.name).toBe("Pat");
  });

  it("shows added leads under All and Under 1 Hr only, and counts them as under 1 hour", () => {
    const s = run(fill(fresh(), { name: "Pat", phone: "6145550100" }), { type: "submit" });
    expect(filterCounts(MOCK_LEADS, s)).toEqual({ all: 9, warn: 2, bad: 1, hot: 1 });
    expect(visibleAdded(s)).toHaveLength(1);
    expect(visibleAdded(run(s, { type: "filter", filter: "warn" }))).toHaveLength(1);
    expect(visibleAdded(run(s, { type: "filter", filter: "bad" }))).toHaveLength(0);
    expect(visibleAdded(run(s, { type: "filter", filter: "hot" }))).toHaveLength(0);
  });
});

describe("tiles and source panel", () => {
  it("starts at 13 leads this week by source", () => {
    const rows = sourceRows(0);
    expect(rows.map((r) => [r.key, r.label, r.count, r.width])).toEqual([
      ["call", "Call", 4, 100],
      ["form", "Web form", 3, 75],
      ["text", "Text", 2, 50],
      ["gmb", "Google My Business", 2, 50],
      ["fb", "Facebook", 1, 25],
      ["ig", "Instagram", 1, 25],
      ["you", "Added by you", 0, 0],
    ]);
    expect(rows.slice(0, 6).reduce((n, r) => n + r.count, 0)).toBe(13);
  });

  it("counts hand-added leads as Added by you, 25% per lead up to 100%", () => {
    expect(sourceRows(2).at(-1)).toMatchObject({ key: "you", count: 2, width: 50 });
    expect(sourceRows(6).at(-1)).toMatchObject({ count: 6, width: 100 });
  });

  it("New today and This week stay at the sample counts (as in the design); Wait on you follows the leads", () => {
    expect(tiles(MOCK_LEADS, fresh())).toEqual({ today: 4, week: 13, wait: 3 });
    const s = run(fill(fresh(), { name: "Pat", phone: "6145550100" }), { type: "submit" }, { type: "call", id: "ld-1" });
    expect(tiles(MOCK_LEADS, s)).toEqual({ today: 4, week: 13, wait: 3 });
  });
});

describe("old leads and automatic switch", () => {
  it("walks idle, ask, sent and back on cancel", () => {
    expect(run(fresh(), { type: "old", to: "ask" }).old).toBe("ask");
    expect(run(fresh(), { type: "old", to: "ask" }, { type: "old", to: "idle" }).old).toBe("idle");
    expect(run(fresh(), { type: "old", to: "ask" }, { type: "old", to: "sent" }).old).toBe("sent");
  });

  it("toggles the automatic switch", () => {
    expect(run(fresh(), { type: "toggleAuto" }).auto).toBe(true);
    expect(run(fresh(), { type: "toggleAuto" }, { type: "toggleAuto" }).auto).toBe(false);
  });
});

describe("search rows", () => {
  it("has one row per mock lead, pointing at /leads", () => {
    expect(searchRows).toHaveLength(MOCK_LEADS.length);
    for (const r of searchRows) {
      expect(r.page).toBe("leads");
      expect(r.href).toBe("/leads");
    }
    expect(searchRows[0]).toMatchObject({ name: "Maria Alvarez" });
    expect(new Set(searchRows.map((r) => r.id)).size).toBe(searchRows.length);
  });
});

describe("wait words from minutes (the backend sends minutes, never a label)", () => {
  it.each([
    [0, "0 min"], [14, "14 min"], [59, "59 min"], [60, "1 hr"], [119, "1 hr"], [120, "2 hrs"], [1439, "23 hrs"],
    [1440, "1 day"], [2879, "1 day"], [2880, "2 days"],
  ])("%i minutes reads %s", (minutes, text) => {
    expect(waitText(minutes)).toBe(text);
  });

  it("the mock leads carry minutes waiting and no ready-made wait label", () => {
    for (const l of MOCK_LEADS) {
      expect(typeof l.minutesWaiting, l.name).toBe("number");
      expect(l, l.name).not.toHaveProperty("when");
      expect(l, l.name).not.toHaveProperty("mins");
    }
  });

  it("the row's time is the wait for a waiting lead and the arrival for the others", () => {
    const by = (id: string) => MOCK_LEADS.find((l) => l.id === id)!;
    expect(rowWhen(by("ld-1"))).toBe("14 min");
    expect(rowWhen(by("ld-2"))).toBe("1 hr");
    expect(rowWhen(by("ld-3"))).toBe("2 days");
    expect(rowWhen(by("ld-4"))).toBe("2 hrs");
    expect(rowWhen(by("ld-5"))).toBe("Yesterday");
  });
});

describe("who waits longest: a tie", () => {
  it("picks the first in the list when two leads wait the same minutes", () => {
    const base = MOCK_LEADS[0];
    const leads = [
      { ...base, id: "t1", name: "Ann First", minutesWaiting: 90, status: "call" as const },
      { ...base, id: "t2", name: "Bob Second", minutesWaiting: 90, status: "reply" as const },
    ];
    const s = summarize(leads, createInitialState(leads));
    expect(s.target).toEqual({ id: "t1", kind: "call" });
    expect(s.b).toBe("Ann waits longest: 1 hr.");
  });
});

describe("filter keys", () => {
  it("arrows wrap around, Home goes to the first and End to the last, other keys do nothing", () => {
    expect(filterKeyIndex("ArrowRight", 3, 4)).toBe(0);
    expect(filterKeyIndex("ArrowDown", 1, 4)).toBe(2);
    expect(filterKeyIndex("ArrowLeft", 0, 4)).toBe(3);
    expect(filterKeyIndex("ArrowUp", 2, 4)).toBe(1);
    expect(filterKeyIndex("Home", 2, 4)).toBe(0);
    expect(filterKeyIndex("End", 1, 4)).toBe(3);
    expect(filterKeyIndex("a", 1, 4)).toBe(-1);
  });
});

describe("Add a lead on a phone or a computer", () => {
  it("opens the bottom sheet on a phone and goes to the side form on a computer", () => {
    expect(addLeadMode(true)).toBe("sheet");
    expect(addLeadMode(false)).toBe("form");
  });
});
