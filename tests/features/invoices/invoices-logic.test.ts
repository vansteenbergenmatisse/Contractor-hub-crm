import { describe, expect, it, vi } from "vitest";
import {
  INVOICE_DUE_DAYS,
  hasBusinessHeader,
  invoiceRowActions,
  markPaidPatch,
  markSentPatch,
  unmarkPaid,
  unmarkPaidPatch,
  OVER_WEEK_DAYS,
  addDaysIso,
  canSend,
  fixFieldA11y,
  rowFillNo,
  buildMockInvoices,
  businessCard,
  chipFor,
  daysBetween,
  daysLate,
  editInvoice,
  fixMissing,
  formatDay,
  formatMoney,
  initialsOf,
  markPaid,
  markSent,
  matchesFilter,
  missingField,
  parsePrice,
  searchRows,
  sendRequest,
  sheetFor,
  toIsoDay,
  totals,
  type Invoice,
} from "@/features/invoices";

// Fixed "now": Saturday 21 Nov 2026, local time.
const NOW = new Date(2026, 10, 21, 10, 30);
const base: Invoice = { no: 1, name: "Sample Customer", svc: "Gutter repair", amt: 950, addr: "1 Sample St", st: "ready", note: "", justNow: false, dueOn: null, paidOn: null };
const mock = () => buildMockInvoices(NOW);

describe("money", () => {
  it("formats whole dollars with thousands separators", () => {
    expect(formatMoney(0)).toBe("$0");
    expect(formatMoney(950)).toBe("$950");
    expect(formatMoney(1200)).toBe("$1,200");
    expect(formatMoney(9500)).toBe("$9,500");
    expect(formatMoney(1234567.4)).toBe("$1,234,567");
  });
  it("parses a typed price", () => {
    expect(parsePrice("950")).toBe(950);
    expect(parsePrice(" $1,250.50 ")).toBe(1250.5);
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("0")).toBeNull();
    expect(parsePrice("-5")).toBeNull();
    expect(parsePrice("abc")).toBeNull();
    expect(parsePrice("12abc")).toBeNull();
  });
});

describe("dates", () => {
  it("keeps the due term in one constant", () => {
    expect(INVOICE_DUE_DAYS).toBe(7);
  });
  it("makes ISO days from local parts and adds days across month ends", () => {
    expect(toIsoDay(NOW)).toBe("2026-11-21");
    expect(addDaysIso("2026-11-21", 7)).toBe("2026-11-28");
    expect(addDaysIso("2026-11-28", 7)).toBe("2026-12-05");
    expect(addDaysIso("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDaysIso("2026-11-21", -21)).toBe("2026-10-31");
  });
  it("counts days between", () => {
    expect(daysBetween("2026-11-14", "2026-11-21")).toBe(7);
    expect(daysBetween("2026-11-21", "2026-11-14")).toBe(-7);
    expect(daysBetween("2026-11-21", "2026-11-21")).toBe(0);
  });
  it("counts days late, never below 0", () => {
    expect(daysLate("2026-11-21", NOW)).toBe(0);
    expect(daysLate("2026-11-28", NOW)).toBe(0);
    expect(daysLate("2026-11-15", NOW)).toBe(6);
    expect(daysLate("2026-11-07", NOW)).toBe(14);
  });
  it("formats a short day", () => {
    expect(formatDay("2026-11-09")).toBe("Nov 9");
    expect(formatDay("2026-12-05")).toBe("Dec 5");
  });
});

describe("mock invoices", () => {
  it("starts with 8 invoices: 3 needing a field, 1 ready, 3 sent, 1 paid", () => {
    const list = mock();
    expect(list).toHaveLength(8);
    expect(list.filter((i) => i.st === "need")).toHaveLength(3);
    expect(list.filter((i) => i.st === "ready")).toHaveLength(1);
    expect(list.filter((i) => i.st === "sent")).toHaveLength(3);
    expect(list.filter((i) => i.st === "paid")).toHaveLength(1);
  });
  it("dates the sent invoices from now", () => {
    const sent = mock().filter((i) => i.st === "sent");
    expect(sent.map((i) => daysLate(i.dueOn as string, NOW))).toEqual([0, 6, 14]);
  });
  it("puts the paid date in the current month, even on the 1st", () => {
    const first = buildMockInvoices(new Date(2026, 11, 1, 9));
    const paid = first.find((i) => i.st === "paid");
    expect(paid?.paidOn?.slice(0, 7)).toBe("2026-12");
  });
});

describe("missing field detection and fix", () => {
  it("finds the one missing thing", () => {
    expect(missingField({ ...base, amt: 0 })).toBe("price");
    expect(missingField({ ...base, addr: "" })).toBe("addr");
    expect(missingField({ ...base, name: "" })).toBe("name");
    expect(missingField(base)).toBeNull();
  });
  it("matches the sample drafts", () => {
    const list = mock();
    expect(list.filter((i) => i.st === "need").map(missingField)).toEqual(["price", "addr", "name"]);
  });
  it("fixes the price and makes the draft ready", () => {
    const r = fixMissing({ ...base, amt: 0, st: "need" }, "$950");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.invoice.amt).toBe(950);
      expect(r.invoice.st).toBe("ready");
    }
  });
  it("fixes the address and the name", () => {
    const a = fixMissing({ ...base, addr: "", st: "need" }, "  5 Oak Ave ");
    const n = fixMissing({ ...base, name: "", st: "need" }, "Pat Lee");
    expect(a.ok && a.invoice.addr).toBe("5 Oak Ave");
    expect(n.ok && n.invoice.name).toBe("Pat Lee");
  });
  it("says what is wrong and changes nothing", () => {
    const price = fixMissing({ ...base, amt: 0, st: "need" }, "nope");
    const addr = fixMissing({ ...base, addr: "", st: "need" }, "  ");
    const name = fixMissing({ ...base, name: "", st: "need" }, "");
    expect(price).toEqual({ ok: false, error: "Enter the price in dollars. For example 950." });
    expect(addr).toEqual({ ok: false, error: "Enter the billing address." });
    expect(name).toEqual({ ok: false, error: "Enter the name for the invoice." });
  });
  it("stays a draft when a second thing is still missing", () => {
    const r = fixMissing({ ...base, amt: 0, addr: "", st: "need" }, "100");
    expect(r.ok && r.invoice.st).toBe("need");
  });
});

describe("edit on the sheet", () => {
  const form = { name: "Sam Roe", addr: "9 Elm St", svc: "Roof repair", price: "1,200" };
  it("saves all four fields", () => {
    const r = editInvoice(base, form);
    expect(r.ok && r.invoice).toMatchObject({ name: "Sam Roe", addr: "9 Elm St", svc: "Roof repair", amt: 1200 });
  });
  it("promotes a draft that now has all it needs", () => {
    const r = editInvoice({ ...base, amt: 0, st: "need" }, form);
    expect(r.ok && r.invoice.st).toBe("ready");
  });
  it("demotes a ready invoice whose field was cleared", () => {
    const r = editInvoice(base, { ...form, addr: "" });
    expect(r.ok && r.invoice.st).toBe("need");
  });
  it("needs the work, and a price that is a positive number if typed", () => {
    expect(editInvoice(base, { ...form, svc: "" })).toEqual({ ok: false, error: "Say what the work was." });
    expect(editInvoice(base, { ...form, price: "abc" })).toEqual({ ok: false, error: "Enter the price in dollars. For example 950." });
  });
  it("allows an empty price and keeps the invoice a draft", () => {
    const r = editInvoice(base, { ...form, price: "" });
    expect(r.ok && r.invoice.amt).toBe(0);
    expect(r.ok && r.invoice.st).toBe("need");
  });
  it("keeps a sent invoice sent", () => {
    const r = editInvoice({ ...base, st: "sent", dueOn: "2026-11-28" }, form);
    expect(r.ok && r.invoice.st).toBe("sent");
  });
});

describe("status flow", () => {
  it("draft with a missing field -> ready -> sent -> paid", () => {
    let inv: Invoice = { ...base, amt: 0, st: "need" };
    expect(missingField(inv)).toBe("price");
    const fixed = fixMissing(inv, "950");
    if (!fixed.ok) throw new Error("expected ok");
    inv = fixed.invoice;
    expect(inv.st).toBe("ready");
    inv = markSent(inv, NOW);
    expect(inv.st).toBe("sent");
    expect(inv.justNow).toBe(true);
    expect(inv.dueOn).toBe("2026-11-28");
    inv = markPaid(inv, NOW);
    expect(inv.st).toBe("paid");
    expect(inv.paidOn).toBe("2026-11-21");
  });
  it("sends only a ready invoice and marks paid only a sent one", () => {
    const draft: Invoice = { ...base, st: "need" };
    expect(markSent(draft, NOW)).toBe(draft);
    expect(markPaid(base, NOW)).toBe(base);
    const paid: Invoice = { ...base, st: "paid" };
    expect(markSent(paid, NOW)).toBe(paid);
  });
});

describe("labels", () => {
  const sentBase: Invoice = { ...base, st: "sent" };
  it("labels a draft with what it needs", () => {
    expect(chipFor({ ...base, amt: 0, st: "need" }, NOW)).toEqual({ tone: "is-warn", text: "Needs the price" });
    expect(chipFor({ ...base, addr: "", st: "need" }, NOW)).toEqual({ tone: "is-warn", text: "Needs the address" });
    expect(chipFor({ ...base, name: "", st: "need" }, NOW)).toEqual({ tone: "is-warn", text: "Needs the name" });
  });
  it("labels a ready invoice", () => {
    expect(chipFor(base, NOW)).toEqual({ tone: "is-plain", text: "Ready to send" });
    expect(chipFor({ ...base, note: "Made when the job was marked done" }, NOW).text).toBe("Made when the job was marked done");
  });
  it("labels sent invoices by lateness: light red late, full red over 7 days", () => {
    expect(chipFor({ ...sentBase, dueOn: "2026-11-21" }, NOW)).toEqual({ tone: "is-warn", text: "Due Nov 21" });
    expect(chipFor({ ...sentBase, dueOn: "2026-11-28" }, NOW)).toEqual({ tone: "is-warn", text: "Due Nov 28" });
    expect(chipFor({ ...sentBase, dueOn: "2026-11-20" }, NOW)).toEqual({ tone: "is-bad", text: "1 day late" });
    expect(chipFor({ ...sentBase, dueOn: "2026-11-15" }, NOW)).toEqual({ tone: "is-bad", text: "6 days late" });
    expect(chipFor({ ...sentBase, dueOn: "2026-11-14" }, NOW)).toEqual({ tone: "is-bad", text: "7 days late" });
    expect(chipFor({ ...sentBase, dueOn: "2026-11-13" }, NOW)).toEqual({ tone: "is-hot", text: "8 days late" });
  });
  it("labels just-sent and paid", () => {
    expect(chipFor({ ...sentBase, justNow: true, dueOn: "2026-11-28" }, NOW)).toEqual({ tone: "is-ok", text: "Sent just now" });
    expect(chipFor({ ...base, st: "paid", paidOn: "2026-11-09" }, NOW)).toEqual({ tone: "is-ok", text: "Paid Nov 9" });
    expect(chipFor({ ...base, st: "paid", justNow: true, paidOn: "2026-11-21" }, NOW)).toEqual({ tone: "is-ok", text: "Paid just now" });
  });
});

describe("sheet", () => {
  it("shows the due term of a draft and a missing-field note", () => {
    const s = sheetFor({ ...base, amt: 0, name: "", addr: "", st: "need" }, NOW);
    expect(s.title).toBe("Invoice 1");
    expect(s.due).toBe("Due 7 days after you send it");
    expect(s.name).toBe("Name missing");
    expect(s.addr).toBe("Address missing");
    expect(s.total).toBe("Price missing");
    expect(s.lineAmount).toBe("Price missing");
  });
  it("shows the due date of a sent invoice and the late days", () => {
    expect(sheetFor({ ...base, st: "sent", dueOn: "2026-11-28" }, NOW).due).toBe("Due Nov 28");
    // Design wording (logic 953): the lateness alone once late, "Due in 7 days" right after a send.
    expect(sheetFor({ ...base, st: "sent", dueOn: "2026-11-15" }, NOW).due).toBe("6 days late");
    expect(sheetFor({ ...base, st: "sent", dueOn: "2026-11-07" }, NOW).due).toBe("14 days late");
    expect(sheetFor({ ...base, st: "sent", justNow: true, dueOn: "2026-11-28" }, NOW).due).toBe("Due in 7 days");
  });
  it("shows the paid day", () => {
    expect(sheetFor({ ...base, st: "paid", paidOn: "2026-11-09" }, NOW).due).toBe("Paid Nov 9");
    expect(sheetFor({ ...base, st: "paid", justNow: true, paidOn: "2026-11-21" }, NOW).due).toBe("Paid today");
  });
  it("takes the business facts from the values it gets", () => {
    const card = businessCard({
      business_name: "Sample Co", business_address: "1 A St", business_phone_number: "555", business_email: "a@b.example",
      business_hours: "Mon", business_website_url: "https://www.sample.example/path",
    });
    expect(card).toEqual({ init: "SC", name: "Sample Co", addr: "1 A St", phone: "555", email: "a@b.example", site: "sample.example", hours: "Mon", logo: null });
    expect(businessCard({ business_name: "Sample Roofing" }).init).toBe("SR");
    expect(businessCard({}, "https://cdn.example/logo.png").logo).toBe("https://cdn.example/logo.png");
  });
  it("makes initials", () => {
    expect(initialsOf("Hilliard Storage")).toBe("HS");
    expect(initialsOf("Marco")).toBe("M");
    expect(initialsOf("")).toBe("");
  });
});

describe("filters and counts", () => {
  it("groups drafts under To send", () => {
    expect(matchesFilter("all", "paid")).toBe(true);
    expect(matchesFilter("todo", "need")).toBe(true);
    expect(matchesFilter("todo", "ready")).toBe(true);
    expect(matchesFilter("todo", "sent")).toBe(false);
    expect(matchesFilter("sent", "sent")).toBe(true);
    expect(matchesFilter("paid", "sent")).toBe(false);
  });
  it("counts the tiles from the sample", () => {
    expect(totals(mock(), NOW)).toEqual({ todo: 4, owed: 9500 + 4850 + 9400, paid: 1950 });
  });
  it("moves a sent invoice from owed to paid", () => {
    const list = mock().map((i) => (i.no === 1045 ? markPaid(i, NOW) : i));
    expect(totals(list, NOW)).toEqual({ todo: 4, owed: 4850 + 9400, paid: 1950 + 9500 });
  });
  it("counts paid only inside the current month", () => {
    const old: Invoice = { ...base, st: "paid", paidOn: "2026-10-30" };
    expect(totals([old], NOW).paid).toBe(0);
  });
});

describe("send timer request", () => {
  it("carries the invoice, the total and the document lines", () => {
    const onDone = vi.fn();
    const req = sendRequest({ ...base, no: 1049, name: "Hilliard Storage", svc: "Gutter repair", amt: 1200, addr: "4000 Cemetery Rd, Hilliard" }, onDone);
    expect(req.kind).toBe("Invoice");
    expect(req.name).toBe("Hilliard Storage");
    expect(req.total).toBe("$1,200");
    expect(req.doc).toEqual({ title: "Invoice 1049", name: "Hilliard Storage", sub: "4000 Cemetery Rd, Hilliard", amount: "$1,200", lines: [["Gutter repair", "$1,200"]] });
    expect(onDone).not.toHaveBeenCalled();
    req.onDone();
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("search rows", () => {
  it("exports invoice rows that open /invoices", () => {
    expect(searchRows).toHaveLength(8);
    for (const row of searchRows) {
      expect(row.page).toBe("invoices");
      expect(row.href).toBe("/invoices");
      expect(row.id).toMatch(/^invoice-\d+$/);
    }
    expect(new Set(searchRows.map((r) => r.id)).size).toBe(8);
    expect(searchRows.find((r) => r.id === "invoice-1049")?.sub).toContain("Invoice 1049");
  });
  it("names an invoice with no customer name by its number", () => {
    expect(searchRows.find((r) => r.id === "invoice-1046")?.name).toBe("Invoice 1046");
  });
});

describe("only a complete invoice can open the send timer", () => {
  it("a ready invoice can be sent", () => {
    expect(canSend(base)).toBe(true);
  });
  it("a draft that misses the price, the address or the name can not", () => {
    expect(canSend({ ...base, st: "need", amt: 0 })).toBe(false);
    expect(canSend({ ...base, st: "need", addr: "" })).toBe(false);
    expect(canSend({ ...base, st: "need", name: "" })).toBe(false);
  });
  it("an invoice marked ready that still misses a field can not", () => {
    expect(canSend({ ...base, st: "ready", amt: 0 })).toBe(false);
    expect(canSend({ ...base, st: "ready", name: " " })).toBe(false);
  });
  it("a sent or paid invoice can not be sent again", () => {
    expect(canSend({ ...base, st: "sent", dueOn: "2026-11-28" })).toBe(false);
    expect(canSend({ ...base, st: "paid", paidOn: "2026-11-20" })).toBe(false);
  });
  it("every mock draft is blocked and every mock ready one is not", () => {
    for (const inv of mock()) expect(canSend(inv)).toBe(inv.st === "ready");
  });
});

describe("two separate 7-day numbers", () => {
  const today = toIsoDay(NOW);
  const sent: Invoice = { ...base, st: "sent" };
  it("the due term is its own constant and drives the due day and the sheet", () => {
    expect(INVOICE_DUE_DAYS).toBe(7);
    expect(markSent(base, NOW).dueOn).toBe(addDaysIso(today, INVOICE_DUE_DAYS));
    expect(sheetFor(base, NOW).due).toBe(`Due ${INVOICE_DUE_DAYS} days after you send it`);
  });
  it("full red starts after OVER_WEEK_DAYS days late", () => {
    expect(OVER_WEEK_DAYS).toBe(7);
    expect(chipFor({ ...sent, dueOn: addDaysIso(today, -OVER_WEEK_DAYS) }, NOW).tone).toBe("is-bad");
    expect(chipFor({ ...sent, dueOn: addDaysIso(today, -(OVER_WEEK_DAYS + 1)) }, NOW).tone).toBe("is-hot");
  });
});

describe("the filled button on the list (design: the first ready invoice, at every width)", () => {
  const list = mock();
  const first = list.find((i) => i.st === "ready")!;
  it("the first ready row is filled", () => {
    expect(rowFillNo(list)).toBe(first.no);
  });
  it("no invoice is ready: no filled row", () => {
    expect(rowFillNo(list.map((i) => (i.st === "ready" ? markSent(i, NOW) : i)))).toBeUndefined();
  });
});

describe("the fix field points at its error", () => {
  it("links the error when there is one", () => {
    expect(fixFieldA11y(1049, "Enter the billing address.")).toEqual({ id: "fd-iv-1049", errorId: "fd-iv-1049-e", "aria-invalid": true, "aria-describedby": "fd-iv-1049-e" });
  });
  it("says nothing when there is no error", () => {
    expect(fixFieldA11y(1049, "")).toEqual({ id: "fd-iv-1049", errorId: "fd-iv-1049-e", "aria-invalid": undefined, "aria-describedby": undefined });
  });
});

describe("round 3: kept-state patches and row actions", () => {
  it("Mark paid and its Undo bring back the chip the invoice had", () => {
    const sentNow = { ...base, st: "sent" as const, justNow: true, dueOn: "2026-11-28" };
    const paid = markPaid(sentNow, NOW);
    expect(paid).toMatchObject({ st: "paid", justNow: true, paidOn: "2026-11-21" });
    expect(unmarkPaid(paid)).toMatchObject({ st: "sent", justNow: true, paidOn: null });
    const late = { ...base, st: "sent" as const, dueOn: "2026-11-07" };
    expect(chipFor(unmarkPaid(markPaid(late, NOW)), NOW)).toEqual({ tone: "is-hot", text: "14 days late" });
    // a paid invoice from the sample data (not paid on this screen) has nothing to undo
    const seeded = { ...base, st: "paid" as const, paidOn: "2026-11-09" };
    expect(unmarkPaid(seeded)).toBe(seeded);
  });
  it("patches change only their own invoice and never step back", () => {
    const list = [{ ...base, no: 1 }, { ...base, no: 2, st: "sent" as const, dueOn: "2026-11-28" }];
    expect(markSentPatch(1, NOW)({ invoices: list }).invoices.map((i) => i.st)).toEqual(["sent", "sent"]);
    const paid = markPaidPatch(2, NOW)({ invoices: list }).invoices;
    expect(paid.map((i) => i.st)).toEqual(["ready", "paid"]);
    expect(markSentPatch(2, NOW)({ invoices: paid }).invoices[1].st).toBe("paid");
    expect(unmarkPaidPatch(2)({ invoices: paid }).invoices[1].st).toBe("sent");
  });
  it("row actions: swipe right runs the filled Send invoice, else View; swipe left is Mark paid", () => {
    const h = { filled: true, onView() {}, onSend() {}, onPaid() {}, onMake() {} };
    const side = (a: ReturnType<typeof invoiceRowActions>, s: "right" | "left") => a.find((x) => x.swipe === s)?.label;
    expect(side(invoiceRowActions(base, h), "right")).toBe("Send invoice");
    expect(side(invoiceRowActions(base, { ...h, filled: false }), "right")).toBe("View");
    const sent = invoiceRowActions({ ...base, st: "sent" }, h);
    expect([side(sent, "right"), side(sent, "left")]).toEqual(["View", "Mark paid"]);
    expect(side(invoiceRowActions({ ...base, st: "need" }, h), "left")).toBeUndefined();
  });
  it("the sheet header shows only when there is a business value", () => {
    expect(hasBusinessHeader(businessCard({}))).toBe(false);
    expect(hasBusinessHeader(businessCard({ business_phone_number: "1" }))).toBe(true);
    expect(hasBusinessHeader(businessCard({}, "https://cdn.example/l.png"))).toBe(true);
  });
});
