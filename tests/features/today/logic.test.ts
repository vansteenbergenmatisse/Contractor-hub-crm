import { describe, expect, it } from "vitest";
import {
  createReducer, doneText, greeting, initialState, LEADS, leadMeta, leadsFor, mapsUrl, nextLabel, nextStop, nextTodo, numClass, openCount, pressPlan, rowClass,
  searchRows, sendRequest, setFilter, setRange, setStatus, STOPS, TODOS, visitChip,
} from "@/features/today";

const byId = (id: string) => TODOS.find((t) => t.id === id)!;
const fresh = () => initialState(TODOS);

describe("state", () => {
  it("starts with every to-do open, filter all, range today", () => {
    const s = fresh();
    expect(openCount(s, TODOS)).toBe(6);
    expect(s.filter).toBe("all");
    expect(s.range).toBe("today");
  });

  it("marks a to-do done, and the count drops", () => {
    const s = setStatus(fresh(), TODOS, "maria", 1);
    expect(openCount(s, TODOS)).toBe(5);
    expect(s.ev).toBe("row:maria");
    expect(s.bumps).toBe(1);
  });

  it("Undo brings a normal to-do back", () => {
    const s = setStatus(setStatus(fresh(), TODOS, "raj", 1), TODOS, "raj", 0);
    expect(openCount(s, TODOS)).toBe(6);
  });

  it("ignores the same value and an unknown id", () => {
    const s = fresh();
    expect(setStatus(s, TODOS, "maria", 0)).toBe(s);
    expect(setStatus(s, TODOS, "nobody", 1)).toBe(s);
  });

  it("has no Undo after a send (quote approved, invoice sent)", () => {
    for (const id of ["derek", "whitmore"]) {
      const sent = setStatus(fresh(), TODOS, id, 1);
      expect(setStatus(sent, TODOS, id, 0)).toBe(sent);
    }
  });

  it("allows Undo of Yes, paid (nothing is sent) and of No-show", () => {
    const paid = setStatus(fresh(), TODOS, "whitmore", 2);
    expect(setStatus(paid, TODOS, "whitmore", 0).status.whitmore).toBe(0);
    const noShow = setStatus(fresh(), TODOS, "tom", 2);
    expect(setStatus(noShow, TODOS, "tom", 0).status.tom).toBe(0);
  });

  it("filter and range change once and only when different", () => {
    const s = fresh();
    expect(setFilter(s, "all")).toBe(s);
    expect(setFilter(s, "quote").filter).toBe("quote");
    expect(setRange(s, "today")).toBe(s);
    expect(setRange(s, "week")).toMatchObject({ range: "week", ev: "seg" });
  });

  it("the reducer routes the three actions", () => {
    const r = createReducer(TODOS);
    let s = r(fresh(), { type: "set", id: "jordan", value: 1 });
    s = r(s, { type: "filter", filter: "job" });
    s = r(s, { type: "range", range: "week" });
    expect(s).toMatchObject({ filter: "job", range: "week" });
    expect(s.status.jordan).toBe(1);
  });
});

describe("selectors", () => {
  it("greets with the right words at 6, 1 and 0 things left", () => {
    expect(greeting(6)).toEqual({ count: "6 things", tail: "need you today." });
    expect(greeting(1)).toEqual({ count: "1 thing", tail: "needs you today." });
    expect(greeting(0)).toEqual({ count: "All done", tail: "for today." });
  });

  it("the next to-do is the first open one from the top and moves on", () => {
    let s = fresh();
    expect(nextTodo(s, TODOS)?.id).toBe("maria");
    expect(nextLabel(nextTodo(s, TODOS))).toBe("Next: Call · Maria Alvarez");
    s = setStatus(s, TODOS, "maria", 1);
    expect(nextTodo(s, TODOS)?.id).toBe("jordan");
    s = setStatus(s, TODOS, "maria", 0);
    expect(nextTodo(s, TODOS)?.id).toBe("maria");
  });

  it("has no next to-do and an empty label when all are done", () => {
    let s = fresh();
    for (const t of TODOS) s = setStatus(s, TODOS, t.id, 1);
    expect(nextTodo(s, TODOS)).toBeUndefined();
    expect(nextLabel(undefined)).toBe("");
    expect(openCount(s, TODOS)).toBe(0);
  });

  it("labels the last two next rows as the design does", () => {
    expect(nextLabel(byId("tom"))).toBe("Next: Visit done · Tom Becker");
    expect(nextLabel(byId("whitmore"))).toBe("Next: Yes, send invoice · Whitmore Dental");
  });

  it("builds the row class: is-two, is-next, is-last, is-done, is-nou, is-off", () => {
    let s = fresh();
    expect(rowClass(s, TODOS, byId("maria"))).toBe("fd-row is-next");
    expect(rowClass(s, TODOS, byId("tom"))).toBe("fd-row is-two");
    s = setStatus(s, TODOS, "maria", 1);
    expect(rowClass(s, TODOS, byId("maria"))).toBe("fd-row is-done is-last");
    expect(rowClass(s, TODOS, byId("jordan"))).toBe("fd-row is-next");
    s = setStatus(s, TODOS, "derek", 1);
    expect(rowClass(s, TODOS, byId("derek"))).toContain("is-nou");
    s = setFilter(s, "job");
    expect(rowClass(s, TODOS, byId("raj"))).toContain("is-off");
    expect(rowClass(s, TODOS, byId("tom"))).not.toContain("is-off");
  });

  it("the filter keeps the next to-do the same (design: first open overall)", () => {
    const s = setFilter(fresh(), "job");
    expect(nextTodo(s, TODOS)?.id).toBe("maria");
  });

  it("says what the system does next, per answer", () => {
    let s = setStatus(fresh(), TODOS, "tom", 1);
    expect(doneText(s, byId("tom"))).toBe("Visit done. Add the service and the price.");
    s = setStatus(s, TODOS, "tom", 2);
    expect(doneText(s, byId("tom"))).toBe("No-show. The chase texts start.");
    s = setStatus(fresh(), TODOS, "whitmore", 2);
    expect(doneText(s, byId("whitmore"))).toBe("Job done and paid. The review request follows in one hour.");
    expect(doneText(setStatus(fresh(), TODOS, "maria", 1), byId("maria"))).toBe("Called. The follow-up texts stop.");
  });

  it("alternates the tick class only after a row press", () => {
    expect(numClass(fresh())).toBe("fd-num");
    const a = setStatus(fresh(), TODOS, "maria", 1);
    const b = setStatus(a, TODOS, "jordan", 1);
    expect(numClass(a)).toBe("fd-num fd-tick-a");
    expect(numClass(b)).toBe("fd-num fd-tick-b");
    expect(numClass(setFilter(b, "lead"))).toBe("fd-num");
  });

  it("shows the visit answer chip on Tom's stop only after he is answered", () => {
    const stop = STOPS.find((s) => s.visitOf)!;
    expect(visitChip(fresh(), stop)?.className).toContain("is-off");
    const done = setStatus(fresh(), TODOS, "tom", 1);
    expect(visitChip(done, stop)).toEqual({ className: "fd-chip is-plain is-pop", text: "Done" });
    expect(visitChip(setStatus(fresh(), TODOS, "tom", 2), stop)?.text).toBe("No-show");
    expect(visitChip(fresh(), STOPS[1])).toBeNull();
  });

  it("lists 4 leads for today and 13 for the week (boundary)", () => {
    expect(leadsFor("today")).toHaveLength(4);
    expect(leadsFor("week")).toHaveLength(13);
    expect(leadMeta(LEADS[0], "today")).toBe("Roof leak repair · 14 min ago");
    expect(leadMeta(LEADS[0], "week")).toBe("Roof leak repair · Today");
  });

  it("finds the next stop and builds a maps link", () => {
    expect(nextStop(STOPS)?.time).toBe("11:00 AM");
    expect(nextStop([])).toBeUndefined();
    expect(mapsUrl("88 Olentangy St, Columbus")).toBe("https://maps.google.com/?q=88%20Olentangy%20St%2C%20Columbus");
  });

  it("builds a send request only for the two send rows", () => {
    expect(sendRequest(byId("maria"), () => {})).toBeNull();
    const q = sendRequest(byId("derek"), () => {})!;
    expect(q.kind).toBe("Quote");
    expect(q.total).toBe("$18,400");
    expect(q.doc.lines).toEqual([["Full roof replacement", "$18,400"]]);
    expect(sendRequest(byId("whitmore"), () => {})!.kind).toBe("Invoice");
  });

  it("only the primary answer of a send row opens the timer", () => {
    expect(pressPlan(byId("derek"), 1)).toBe("send");
    expect(pressPlan(byId("whitmore"), 1)).toBe("send");
    expect(pressPlan(byId("whitmore"), 2)).toBe("set");
    expect(pressPlan(byId("maria"), 1)).toBe("set");
    expect(pressPlan(byId("derek"), 0)).toBe("set");
  });

  it("exports search rows with unique ids and real page hrefs", () => {
    const ids = searchRows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(searchRows.find((r) => r.name === "Maria Alvarez")).toMatchObject({ page: "leads", href: "/leads" });
    expect(searchRows.find((r) => r.name === "Bright Daycare")).toMatchObject({ page: "payments", href: "/payments" });
    expect(searchRows.find((r) => r.name === "Harlan Realty")).toMatchObject({ page: "quotes", href: "/quotes" });
  });
});
