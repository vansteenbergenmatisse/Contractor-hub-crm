import { describe, expect, it } from "vitest";
import { MOCK_BUSINESS } from "@/shared/mock/business";
import { bookingLink, buildView, calendarReducer, daySummary, initialState, MOCK_STOPS, siteOf, type CalendarAction } from "@/features/calendar";

const NOW = new Date(2026, 10, 20, 10, 0); // Friday 10:00
const start = () => initialState(MOCK_STOPS, NOW);
const run = (...actions: CalendarAction[]) => actions.reduce(calendarReducer, start());
const view = (s = start()) => buildView(s, NOW, MOCK_BUSINESS);
const id = (name: string) => MOCK_STOPS.find((s) => s.name === name)!.id;

describe("day summary", () => {
  it("says nothing booked, singular and plural", () => {
    expect(daySummary([])).toBe("Nothing booked");
    expect(daySummary([{ kind: "E" }])).toBe("1 stop: 1 estimate");
    expect(daySummary([{ kind: "J" }])).toBe("1 stop: 1 job");
    expect(daySummary([{ kind: "E" }, { kind: "E" }, { kind: "J" }])).toBe("3 stops: 2 estimates, 1 job");
  });
});

describe("week view model", () => {
  it("shows this week's range, the day title with Today, and the summary of the open day", () => {
    const v = view();
    expect(v.weekText).toBe("Nov 15 – 21, 2026");
    expect(v.dayTitle).toBe("Friday, Nov 20 · Today");
    expect(v.daySummary).toBe("4 stops: 3 estimates, 1 job");
    expect(v.emptyCls).toBe("fd-cempty is-off");
    expect(v.calCls).toBe("fd-cal is-w1 is-sd5");
  });

  it("lists only the stops of the week in view", () => {
    expect(view().events).toHaveLength(MOCK_STOPS.filter((s) => s.week === 0).length);
    expect(view(run({ type: "step", n: 1 })).events).toHaveLength(MOCK_STOPS.filter((s) => s.week === 1).length);
    expect(view(run({ type: "nav", wk: 9, sd: 1 })).events).toHaveLength(0);
  });

  it("grays what is over and not what is still ahead", () => {
    const events = view().events;
    expect(events.find((e) => e.name === "Tom Becker")!.cls).toContain("is-past");
    expect(events.find((e) => e.name === "Linda Park")!.cls).not.toContain("is-past");
    expect(events.find((e) => e.name === "Whitmore Dental")!.cls).toContain("is-past"); // Thursday
  });

  it("puts the position classes on a stop", () => {
    const e = view().events.find((x) => x.name === "Linda Park")!;
    expect(e.cls).toContain("fd-ev is-E is-d5 is-t8 is-l2");
    expect(e.start).toBe("11:00 AM");
    expect(e.end).toBe("12:00 PM");
  });

  it("draws the now line only in this week's week view, and only inside business hours", () => {
    expect(view().now).toEqual({ row: 7, column: 7, label: "10:00" });
    expect(view().hideTenAm).toBe(true);
    expect(view(run({ type: "step", n: 1 })).now).toBeNull();
    expect(view(run({ type: "setView", view: "day" })).now).toBeNull();
    expect(buildView(start(), new Date(2026, 10, 20, 20, 0), MOCK_BUSINESS).now).toBeNull();
    expect(buildView(start(), new Date(2026, 10, 20, 12, 0), MOCK_BUSINESS).hideTenAm).toBe(false);
  });

  it("has an empty state for a day with nothing booked", () => {
    const v = view(run({ type: "nav", wk: 0, sd: 0 }));
    expect(v.daySummary).toBe("Nothing booked");
    expect(v.emptyCls).toBe("fd-cempty");
  });

  it("marks the day strip: today, the pressed day, days with stops, and their spoken labels", () => {
    const d = view().days;
    expect(d[5].cls).toBe("fd-cday is-today is-on is-has");
    expect(d[0].cls).toBe("fd-cday");
    expect(d[5].num).toBe(20);
    expect(d[5].label).toBe("Friday, November 20, 4 stops");
    expect(d[0].label).toBe("Sunday, November 15, nothing booked");
  });

  it("has week and day arrow labels, and no disabled first or last week", () => {
    const w = view().arrows;
    expect(w.prev.label).toBe("The week before");
    expect(w.next.cls).not.toContain("is-dis");
    expect(view(run({ type: "setView", view: "day" })).arrows.next.label).toBe("The day after");
    expect(view(run({ type: "nav", wk: -40, sd: 1 })).arrows.prev.cls).not.toContain("is-dis");
  });

  it("switches the layout class and the segmented control for the day view", () => {
    const v = view(run({ type: "setView", view: "day" }));
    expect(v.calCls).toContain("is-day");
    expect(v.seg.day).toEqual({ cls: "fd-csb is-on", pressed: true });
    expect(v.seg.week.pressed).toBe(false);
    expect(v.segThumb).toBe("fd-cst is-day");
  });
});

describe("detail panel", () => {
  it("is closed with nothing pressed", () => {
    expect(view().detail.open).toBe(false);
    expect(view().detail.cls).toBe("fd-cdet is-off");
  });

  it("shows the address, time and reminder status of the pressed stop", () => {
    const d = view(run({ type: "pick", id: id("Linda Park") })).detail;
    expect(d).toMatchObject({ open: true, name: "Linda Park", kind: "Estimate", address: "88 Olentangy St, Columbus", status: "Confirmed by text", first: "Linda" });
    expect(d.when).toBe("Fri, Nov 20 · 11:00 AM to 12:00 PM");
    expect(d.cls).toBe("fd-cdet is-on is-o8 is-left");
  });

  it("says a stop that is over is over and offers no reschedule", () => {
    const d = view(run({ type: "pick", id: id("Tom Becker") })).detail;
    expect(d.status).toBe("This visit is over");
    expect(d.canReschedule).toBe(false);
    expect(d.rescheduleCls).toContain("is-off");
    expect(view(run({ type: "pick", id: id("Whitmore Dental") })).detail.status).toBe("This job day is over");
  });

  it("offers three free times when the picker is open, and the stop moves to the one picked", () => {
    const s = run({ type: "pick", id: id("Linda Park") }, { type: "openReschedule" });
    const d = view(s).detail;
    expect(d.pickCls).toBe("fd-dpk");
    expect(d.options.map((o) => o.text)).toEqual(["Sat, Nov 21 · 9:00 AM", "Mon, Nov 23 · 3:00 PM", "Tue, Nov 24 · 4:00 PM"]);
    const after = calendarReducer(s, { type: "move", id: id("Linda Park"), to: d.options[0].place! });
    const v = view(after);
    expect(v.detail.moveText).toBe("Moved from Fri, Nov 20, 11:00 AM. Linda got a text.");
    expect(v.detail.status).toBe("A reminder goes out the day before");
    expect(v.dayTitle).toBe("Saturday, Nov 21");
    const undone = view(calendarReducer(after, { type: "undoMove" }));
    expect(undone.detail.moveText).toBe("");
    expect(undone.dayTitle).toBe("Friday, Nov 20 · Today");
  });

  it("hides the picker until Reschedule is pressed, and Keep the old time hides it again", () => {
    const s = run({ type: "pick", id: id("Linda Park") });
    expect(view(s).detail.pickCls).toBe("fd-dpk is-off");
    expect(view(calendarReducer(s, { type: "openReschedule" })).detail.pickCls).toBe("fd-dpk");
    expect(view(run({ type: "pick", id: id("Linda Park") }, { type: "openReschedule" }, { type: "cancelReschedule" })).detail.pickCls).toBe("fd-dpk is-off");
  });
});

describe("delete question and undo line", () => {
  it("asks with the customer's first name, the time, and the Reschedule way out", () => {
    const c = view(run({ type: "pick", id: id("Linda Park") }, { type: "askDelete", id: id("Linda Park") })).confirm;
    expect(c).toMatchObject({ open: true, title: "Delete the estimate for Linda Park?", yesText: "Delete estimate", canReschedule: true });
    expect(c.body).toBe("Linda loses the spot on Fri, Nov 20 at 11:00 AM. Wrong time? Reschedule keeps the booking.");
  });

  it("does not offer Reschedule for a stop that is over", () => {
    const c = view(run({ type: "askDelete", id: id("Tom Becker") })).confirm;
    expect(c.canReschedule).toBe(false);
    expect(c.body).not.toContain("Reschedule");
  });

  it("is closed by default, and after Delete the line says what went and offers Undo", () => {
    expect(view().confirm.open).toBe(false);
    expect(view().undoDelete.open).toBe(false);
    const v = view(run({ type: "askDelete", id: id("Linda Park") }, { type: "confirmDelete" }));
    expect(v.undoDelete).toEqual({ open: true, text: "Deleted the estimate for Linda Park." });
    expect(v.events.some((e) => e.name === "Linda Park")).toBe(false);
    expect(v.daySummary).toBe("3 stops: 2 estimates, 1 job");
  });
});

describe("stops you add", () => {
  const added = () => run({ type: "openAdd", kind: "J" }, { type: "setAddName", name: "Sam Sample" }, { type: "submitAdd", placement: { week: 0, day: 6, start: 2 } });

  it("shows the sheet with its title and up to three free times", () => {
    const v = view(run({ type: "openAdd", kind: "E" }));
    expect(v.add).toMatchObject({ open: true, title: "New estimate" });
    expect(v.add.options.map((o) => o.text)).toEqual(["Sat, Nov 21 · 9:00 AM", "Mon, Nov 23 · 3:00 PM", "Tue, Nov 24 · 4:00 PM"]);
    expect(view(run({ type: "openAdd", kind: "J" })).add.title).toBe("New job");
    expect(view().add.open).toBe(false);
  });

  it("puts the double-clicked time first", () => {
    const v = view(run({ type: "openAdd", kind: "E", slot: { week: 0, day: 3, start: 6 } }));
    expect(v.add.options[0].text).toBe("Wed, Nov 18 · 10:00 AM");
    expect(v.add.options).toHaveLength(3);
  });

  it("shows the new stop on its day, counts it, and offers a short line with Delete when pressed", () => {
    const s = added();
    const v = view(s);
    const e = v.events.find((x) => x.name === "Sam Sample")!;
    expect(e).toMatchObject({ added: true, cls: expect.stringContaining("fd-evn is-J is-d6 is-t2 is-l12") });
    expect(v.days[6].cls).toContain("is-has");
    const v2 = view(calendarReducer(s, { type: "pick", id: e.id }));
    expect(v2.added?.text).toBe("Job for Sam Sample · Sat, Nov 21 · 8:00 AM");
    expect(v2.detail.open).toBe(false);
  });

  it("counts an added stop on an empty day, so the day is not empty", () => {
    const v = view(added());
    expect(v.dayTitle).toBe("Saturday, Nov 21");
    expect(v.daySummary).toBe("1 stop: 1 job");
    expect(v.emptyCls).toBe("fd-cempty is-off");
  });
});

describe("booking link", () => {
  it("is built from the business website and hours, never hardcoded", () => {
    expect(siteOf("https://www.example-roofing.test/")).toBe("example-roofing.test");
    expect(bookingLink({ business_website_url: "https://www.acme.test", business_hours: "x" })).toBe("acme.test/book");
    const b = view().booking;
    expect(b.link).toBe(`${siteOf(MOCK_BUSINESS.business_website_url)}/book`);
    expect(b.hours).toBe(MOCK_BUSINESS.business_hours);
    expect(b.copyText).toBe("Copy link");
    expect(view(run({ type: "copyLink" })).booking.copyText).toBe("Copied");
  });
});
