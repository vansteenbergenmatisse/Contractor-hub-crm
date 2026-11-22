import { describe, expect, it } from "vitest";
import {
  canUndo, chipText, historyLines, initialState, lateness, markPaid, money, nobodyOwes, remind, totals, undo, undoPaid,
  buildMockPayments, liveState, paymentsFromInvoices, paymentsReducer, rowActionSpecs, searchRows,
} from "@/features/payments";
import { buildMockInvoices, chipFor, markPaid as invoicePaid, markSent as invoiceSent } from "@/features/invoices";

const NOW = new Date(2026, 10, 22, 9, 0);
const rows = buildMockPayments(NOW);
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
  it("sets one flag per row: the history line reads Reminder sent just now, pressing again adds nothing", () => {
    let s = remind(initialState(rows), b.id);
    expect(historyLines(b, s)).toEqual(["Reminder sent just now"]);
    s = remind(s, b.id);
    expect(historyLines(b, s)).toEqual(["Reminder sent just now"]);
  });
  it("offers no Undo: Undo is only for a paid row", () => {
    const s = remind(initialState(rows), b.id);
    expect(canUndo(s, b.id)).toBe(false);
    expect(undo(s, b.id)).toBe(s);
  });
  it("does not change totals", () => {
    const s = remind(initialState(rows), b.id);
    expect(totals(rows, s)).toEqual(totals(rows, initialState(rows)));
  });
  it("does nothing to a paid or unknown invoice", () => {
    const paid = markPaid(initialState(rows), b.id);
    expect(remind(paid, b.id)).toBe(paid);
    expect(remind(paid, "nope")).toBe(paid);
  });
});

describe("Mark paid", () => {
  it("shows the paid chip and stops reminders, Undo restores", () => {
    let s = markPaid(remind(initialState(rows), a.id), a.id);
    expect(chipText(a, s)).toBe("Paid just now");
    expect(historyLines(a, s)).toEqual(["Reminders stopped"]);
    expect(canUndo(s, a.id)).toBe(true);
    s = undo(s, a.id);
    expect(canUndo(s, a.id)).toBe(false);
    expect(chipText(a, s)).toBe(a.when);
    expect(historyLines(a, s)).toEqual(["Reminder sent just now"]);
  });
});

describe("the same invoices as the Invoices page", () => {
  const invoices = buildMockInvoices(NOW).filter((i) => i.st === "sent");
  it("lists every sent invoice once, with the same name, job and amount", () => {
    expect(rows.map((r) => r.invoice).sort()).toEqual(invoices.map((i) => `Invoice ${i.no}`).sort());
    for (const inv of invoices) {
      const r = rows.find((x) => x.invoice === `Invoice ${inv.no}`)!;
      expect(r).toMatchObject({ name: inv.name, job: inv.svc, amount: inv.amt });
    }
  });
  it("shows the due chip the Invoices page shows (1045 is due today there, so here too)", () => {
    for (const inv of invoices) {
      const r = rows.find((x) => x.invoice === `Invoice ${inv.no}`)!;
      expect(r.when).toBe(chipFor(inv, NOW).text);
      expect(`is-${lateness(r.daysLate)}`).toBe(chipFor(inv, NOW).tone);
    }
    expect(rows.find((r) => r.invoice === "Invoice 1045")!.when).toBe("Due Nov 22");
    expect(rows.find((r) => r.invoice === "Invoice 1042")!.when).toBe("14 days late");
  });
  it("keeps the design's order: most late first", () => {
    expect(rows.map((r) => r.name)).toEqual(["Bright Daycare", "Grace Whitfield", "Paul Ortega"]);
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

describe("reads the live Invoices list (owner decision: Payments reads live Invoices)", () => {
  const history = () => "The first reminder goes 3 days after the due date";
  it("adds an invoice sent on the Invoices page, due 7 days later, not late", () => {
    const list = buildMockInvoices(NOW).map((i) => (i.no === 1049 ? invoiceSent(i, NOW) : i));
    const live = paymentsFromInvoices(list, NOW, history);
    const r = live.find((x) => x.invoice === "Invoice 1049")!;
    expect(r).toMatchObject({ id: "inv-1049", name: "Hilliard Storage", amount: 1200, daysLate: 0, when: "Due Nov 29" });
    expect(chipText(r, initialState(live))).toBe("Due Nov 29");
    expect(totals(live, initialState(live)).owed).toBe(23750 + 1200);
  });
  it("shows an invoice paid during this visit (here or on Invoices) as paid: Paid just now, reminders stopped, in Paid today, with Undo", () => {
    const list = buildMockInvoices(NOW).map((i) => (i.no === 1044 ? invoicePaid(i, NOW) : i));
    const live = paymentsFromInvoices(list, NOW, history);
    const r = live.find((x) => x.invoice === "Invoice 1044")!;
    expect(r).toMatchObject({ no: 1044, settled: true, when: "6 days late" });
    const s = liveState(live, remind(initialState(live), live[0].id));
    expect(s[r.id]).toEqual({ paid: true, reminded: false });
    expect(s[live[0].id]).toEqual({ paid: false, reminded: true });
    expect(chipText(r, s)).toBe("Paid just now");
    expect(historyLines(r, s)).toEqual(["Reminders stopped"]);
    expect(canUndo(s, r.id)).toBe(true);
    expect(totals(live, s)).toEqual({ owed: 18900, late: 9400, lateCount: 1, got: 4850 });
    expect(rowActionSpecs(r, s)).toEqual([{ label: "Undo", key: "undo" }]);
  });
  it("leaves out invoices paid before today's visit and drafts", () => {
    const live = paymentsFromInvoices(buildMockInvoices(NOW), NOW, history);
    expect(live.map((r) => r.invoice).sort()).toEqual(["Invoice 1042", "Invoice 1044", "Invoice 1045"]);
  });
  it("tracks a row that appears later, so Remind now and Mark paid work on it", () => {
    let s = initialState(rows);
    expect(paymentsReducer(s, { type: "remind", id: "inv-1049" })).toBe(s);
    s = paymentsReducer(s, { type: "track", ids: ["inv-1049", a.id] });
    expect(s["inv-1049"]).toEqual({ paid: false, reminded: false });
    expect(paymentsReducer(s, { type: "track", ids: [a.id] })).toBe(s);
    s = paymentsReducer(s, { type: "paid", id: "inv-1049" });
    expect(s["inv-1049"].paid).toBe(true);
  });
});

describe("row swipe and menu actions (design uxActs / uxItems)", () => {
  it("an open invoice: Remind now on swipe right, Mark paid on swipe left; the menu lists both", () => {
    expect(rowActionSpecs(a, initialState(rows))).toEqual([
      { label: "Remind now", key: "remind", swipe: "right" },
      { label: "Mark paid", key: "paid", swipe: "left" },
    ]);
  });
  it("a paid invoice: only Undo in the menu, no swipe", () => {
    expect(rowActionSpecs(a, markPaid(initialState(rows), a.id))).toEqual([{ label: "Undo", key: "undo" }]);
  });
});
