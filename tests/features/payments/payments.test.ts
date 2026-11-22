import { describe, expect, it } from "vitest";
import {
  canUndo, chipText, historyLines, initialState, lateness, markPaid, money, nobodyOwes, remind, totals, undo, undoPaid, undoRemind,
  MOCK_PAYMENTS, searchRows,
} from "@/features/payments";

const rows = MOCK_PAYMENTS;
const [a, b, c] = rows;

describe("lateness", () => {
  it("is amber at 0 days and when not due yet", () => {
    expect(lateness(0)).toBe("warn");
    expect(lateness(-3)).toBe("warn");
  });
  it("is light red from 1 to 7 days late", () => {
    expect(lateness(1)).toBe("bad");
    expect(lateness(7)).toBe("bad");
  });
  it("is full red from 8 days late", () => {
    expect(lateness(8)).toBe("hot");
    expect(lateness(14)).toBe("hot");
  });
});

describe("money", () => {
  it("adds thousands separators", () => {
    expect(money(9400)).toBe("$9,400");
    expect(money(0)).toBe("$0");
    expect(money(1234567)).toBe("$1,234,567");
  });
});

describe("totals", () => {
  it("sums owed, late and the late count from open invoices", () => {
    expect(totals(rows, initialState(rows))).toEqual({ owed: 23750, late: 14250, lateCount: 2, got: 0 });
  });
  it("moves a paid invoice from owed to paid today, and back on undo", () => {
    let s = markPaid(initialState(rows), a.id);
    expect(totals(rows, s)).toEqual({ owed: 14350, late: 4850, lateCount: 1, got: 9400 });
    s = undoPaid(s, a.id);
    expect(totals(rows, s)).toEqual({ owed: 23750, late: 14250, lateCount: 2, got: 0 });
  });
  it("is all zero for no rows", () => {
    expect(totals([], {})).toEqual({ owed: 0, late: 0, lateCount: 0, got: 0 });
  });
});

describe("Remind now", () => {
  it("adds a history line and Undo removes it", () => {
    let s = remind(initialState(rows), b.id);
    expect(historyLines(b, s)).toEqual([b.history, "Reminder sent just now"]);
    expect(canUndo(s, b.id)).toBe(true);
    s = remind(s, b.id);
    expect(historyLines(b, s)).toHaveLength(3);
    s = undo(undo(s, b.id), b.id);
    expect(historyLines(b, s)).toEqual([b.history]);
    expect(canUndo(s, b.id)).toBe(false);
  });
  it("does not change totals", () => {
    const s = remind(initialState(rows), b.id);
    expect(totals(rows, s)).toEqual(totals(rows, initialState(rows)));
  });
  it("does nothing to a paid or unknown invoice", () => {
    const paid = markPaid(initialState(rows), b.id);
    expect(remind(paid, b.id)).toBe(paid);
    expect(remind(paid, "nope")).toBe(paid);
    expect(undoRemind(paid, b.id)).toBe(paid);
  });
});

describe("Mark paid", () => {
  it("shows the paid chip and stops reminders, Undo restores", () => {
    let s = markPaid(remind(initialState(rows), a.id), a.id);
    expect(chipText(a, s)).toBe("Paid just now");
    expect(historyLines(a, s)).toEqual(["Reminders stopped"]);
    expect(canUndo(s, a.id)).toBe(true);
    s = undo(s, a.id);
    expect(chipText(a, s)).toBe(a.when);
    expect(historyLines(a, s)).toEqual([a.history, "Reminder sent just now"]);
  });
});

describe("empty state", () => {
  it("shows when every invoice is paid or there are none", () => {
    expect(nobodyOwes(rows, initialState(rows))).toBe(false);
    const all = rows.reduce((s, r) => markPaid(s, r.id), initialState(rows));
    expect(nobodyOwes(rows, all)).toBe(true);
    expect(nobodyOwes([], {})).toBe(true);
  });
  it("brings the invoice back with Undo", () => {
    const all = rows.reduce((s, r) => markPaid(s, r.id), initialState(rows));
    expect(nobodyOwes(rows, undo(all, c.id))).toBe(false);
  });
});

describe("search rows", () => {
  it("has one row per invoice, on the payments page, linking to /payments", () => {
    expect(searchRows).toHaveLength(rows.length);
    for (const r of searchRows) {
      expect(r.page).toBe("payments");
      expect(r.href).toBe("/payments");
    }
    expect(new Set(searchRows.map((r) => r.id)).size).toBe(rows.length);
  });
});
