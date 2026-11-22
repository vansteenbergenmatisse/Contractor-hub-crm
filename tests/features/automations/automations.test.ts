import { describe, expect, it } from "vitest";
import {
  MADE_BY_YOU, MAX_NEW, STOP, WAIT, WHEN, askRemove, closeEdit, doesText, draftOf, emptyDraft, fillBusiness, groupByFolder, initialState, keep,
  openEdit, openNew, remove, returnTarget, rowActionSpecs, runLabel, save, sendTest, testLine, toggle, totals, undo, whoLabel,
} from "../../../src/features/automations/api/automations";
import { mockAutomations } from "../../../src/features/automations/mock";

const fresh = () => initialState(mockAutomations());
const byName = (s: ReturnType<typeof fresh>, name: string) => s.items.find((a) => a.name === name)!;

describe("sample set", () => {
  it("has the 17 workflows of the design, all on, valid indexes", () => {
    const items = mockAutomations();
    expect(items).toHaveLength(17);
    for (const a of items) expect(a.on).toBe(true);
    // When / How soon / Stops label per sample row, in the design's order.
    const NOW = "At once", ONCE = "It runs once";
    expect(items.map((a) => [a.name, WHEN[a.when], WAIT[a.wait], STOP[a.stop]])).toEqual([
      ["Lead capture", "A new lead comes in", NOW, ONCE],
      ["Instant reply and same-day follow-ups", "A new lead comes in", NOW, "You call or text back"],
      ["Owner ping", "A lead waits an hour", "After 1 hour", ONCE],
      ["Later-day chase", "A lead stays quiet", "Day 2, 4, 7 and 14", "The customer books or replies"],
      ["Online booking", "A customer books on your booking link", NOW, ONCE],
      ["Estimate reminders", "An estimate is booked", "24 hours and 1 hour before", "The visit is done or cancelled"],
      ["Quote follow-up", "A quote is sent", "Day 2, 6, 12 and 25", "The customer accepts or the quote is lost"],
      ["Booking link after a yes", "A quote is accepted", NOW, ONCE],
      ["Job reminder", "A job is booked", "The day before", ONCE],
      ["Invoice and payment reminders", "An invoice is sent", "Day 3, 7 and 14", "The invoice is paid"],
      ["Check-in texts", "A card moves to Check Back Later", "Every 1 to 3 months", "The customer asks to stop"],
      ["Stop on Lost", "A card moves to Lost", NOW, ONCE],
      ["Thank-you and review request", "A job is marked done", NOW, ONCE],
      ["Referral ask", "A job is marked done", "The day after", ONCE],
      ["Review campaign to old leads", "You start it", NOW, ONCE],
      ["Promotion campaign", "Every 3 to 4 months", NOW, ONCE],
      ["AI quote builder", "A visit is done", NOW, ONCE],
    ]);
  });
});

describe("totals and the switch", () => {
  it("counts running, off and all", () => {
    expect(totals(fresh().items)).toEqual({ on: 17, off: 0, all: 17 });
  });
  it("counts a switched-on campaign that is not started yet as running, as the design does (logic: nOn counts every live row that is on)", () => {
    const s = fresh();
    const campaigns = s.items.filter((a) => a.who === "you");
    expect(campaigns.map((a) => runLabel(a))).toEqual(["Not started yet", "Not started yet"]);
    expect(totals(s.items).on).toBe(17);
    const off = campaigns.reduce((x, a) => toggle(x, a.id), s);
    expect(totals(off.items)).toEqual({ on: 15, off: 2, all: 17 });
  });
  it("flips a row at once and updates the counts", () => {
    let s = fresh();
    const id = byName(s, "Owner ping").id;
    s = toggle(s, id);
    expect(byName(s, "Owner ping").on).toBe(false);
    expect(totals(s.items)).toEqual({ on: 16, off: 1, all: 17 });
    expect(runLabel(byName(s, "Owner ping"))).toBe("Off. Nothing goes out.");
    s = toggle(s, id);
    expect(byName(s, "Owner ping").on).toBe(true);
  });
});

describe("grouping by HighLevel folder", () => {
  it("lists the folders in order with their rows", () => {
    const g = groupByFolder(fresh().items);
    expect(g.map((x) => x.folder)).toEqual(["Lead Capture", "Instant Replies", "Follow-Up + Booking", "Reviews", "Campaigns", "AI Agents"]);
    expect(g.find((x) => x.folder === "Follow-Up + Booking")!.items).toHaveLength(9);
  });
  it("keeps an emptied folder's heading (the design's static headings) and shows Made by you only when it has rows", () => {
    let s = fresh();
    s = remove(s, byName(s, "Lead capture").id);
    const lead = groupByFolder(s.items).find((x) => x.folder === "Lead Capture");
    expect(lead).toBeDefined();
    expect(lead!.items).toHaveLength(0);
    expect(groupByFolder(s.items).map((x) => x.folder)).not.toContain(MADE_BY_YOU);
    // every row removed: all six headings stay, Made by you stays hidden
    let all = fresh();
    for (const a of all.items) all = remove(all, a.id);
    expect(groupByFolder(all.items).map((x) => x.folder)).toEqual(["Lead Capture", "Instant Replies", "Follow-Up + Booking", "Reviews", "Campaigns", "AI Agents"]);
  });
  it("hides Made by you again when its only row is removed", () => {
    let s = save(openNew(fresh()), { ...emptyDraft(), name: "Spring offer" });
    expect(groupByFolder(s.items).at(-1)!.folder).toBe(MADE_BY_YOU);
    s = remove(s, s.items.at(-1)!.id);
    expect(groupByFolder(s.items).map((x) => x.folder)).not.toContain(MADE_BY_YOU);
  });
});

describe("weekly count display", () => {
  it("says how often it ran this week, singular and plural", () => {
    const s = fresh();
    expect(runLabel(byName(s, "Lead capture"))).toBe("Ran 13 times this week");
    expect(runLabel(byName(s, "Booking link after a yes"))).toBe("Ran 1 time this week");
  });
  it("says a campaign you start has not started", () => {
    expect(runLabel(byName(fresh(), "Promotion campaign"))).toBe("Not started yet");
  });
  it("names who acts", () => {
    expect(whoLabel("auto")).toBe("Runs on its own");
    expect(whoLabel("you")).toBe("You start it");
    expect(whoLabel("ok")).toBe("Waits for your OK");
  });
});

describe("editor", () => {
  it("opens on a row and clears an earlier error", () => {
    const id = byName(fresh(), "Job reminder").id;
    const s = openEdit({ ...fresh(), err: "x", test: true }, id);
    expect(s.edit).toBe(id);
    expect(s.err).toBe("");
    expect(s.test).toBe(false);
    expect(draftOf(byName(s, "Job reminder")).wait).toBe(2);
  });
  it("saves a change, marks the row changed and rewrites Does when the timing moves", () => {
    let s = fresh();
    const a = byName(s, "Job reminder");
    s = openEdit(s, a.id);
    s = save(s, { ...draftOf(a), name: "  Job heads-up ", wait: 0 });
    const b = s.items.find((x) => x.id === a.id)!;
    expect(b.name).toBe("Job heads-up");
    expect(b.changed).toBe(true);
    expect(b.does).toBe("Your text goes out: at once.");
    expect(s.edit).toBeNull();
    expect(runLabel(b)).toBe("Changed by you just now");
  });
  it("keeps Does when only the text changes", () => {
    let s = fresh();
    const a = byName(s, "Job reminder");
    s = save(openEdit(s, a.id), { ...draftOf(a), msg: "New text" });
    expect(s.items.find((x) => x.id === a.id)!.does).toBe(a.does);
  });
  it("refuses an empty name, says why, and stays open", () => {
    let s = openEdit(fresh(), byName(fresh(), "Owner ping").id);
    const before = s.items;
    s = save(s, { ...emptyDraft(), name: "   " });
    expect(s.err).toBe("Give it a name.");
    expect(s.edit).not.toBeNull();
    expect(s.items).toBe(before);
  });
  it("Cancel closes without saving", () => {
    const s = closeEdit(openEdit(fresh(), byName(fresh(), "Owner ping").id));
    expect(s.edit).toBeNull();
  });
});

describe("new automation", () => {
  it("adds a row under Made by you, on, not run yet", () => {
    let s = openNew(fresh());
    expect(s.edit).toBe("new");
    s = save(s, { name: "Spring offer", when: 12, wait: 1, msg: "Hi {first name}", stop: 2 });
    const a = s.items.at(-1)!;
    expect(a).toMatchObject({ name: "Spring offer", folder: MADE_BY_YOU, on: true, mine: true, ran: -1, who: "auto" });
    expect(a.does).toBe("Your text goes out: after 1 hour.");
    expect(runLabel(a)).toBe("New. Not run yet.");
    expect(groupByFolder(s.items).at(-1)!.folder).toBe(MADE_BY_YOU);
    expect(totals(s.items).all).toBe(18);
  });
  it("refuses a name that is empty", () => {
    expect(save(openNew(fresh()), emptyDraft()).err).toBe("Give it a name.");
  });
  it("holds only two new ones in the sample", () => {
    let s = fresh();
    expect(MAX_NEW).toBe(2);
    s = save(openNew(s), { ...emptyDraft(), name: "New 1" });
    s = save(openNew(s), { ...emptyDraft(), name: "New 2" });
    expect(s.err).toBe("");
    expect(s.items.filter((a) => a.mine)).toHaveLength(2);
    s = save(openNew(s), { ...emptyDraft(), name: "Third" });
    expect(s.err).toBe("This sample holds two new automations.");
    expect(s.edit).toBe("new");
    expect(s.items.filter((a) => a.mine).map((a) => a.name)).toEqual(["New 1", "New 2"]);
  });
});

describe("remove and undo", () => {
  it("asks once, Keep backs out", () => {
    let s = fresh();
    const id = byName(s, "Referral ask").id;
    s = askRemove(s, id);
    expect(s.conf).toBe(id);
    s = keep(s);
    expect(s.conf).toBeNull();
    expect(totals(s.items).all).toBe(17);
  });
  it("removes the row and Undo brings it back", () => {
    let s = fresh();
    const id = byName(s, "Referral ask").id;
    s = remove(askRemove(s, id), id);
    expect(totals(s.items).all).toBe(16);
    expect(s.last).toBe(id);
    expect(s.conf).toBeNull();
    s = undo(s);
    expect(totals(s.items).all).toBe(17);
    expect(s.last).toBeNull();
  });
  it("closes the editor when its row is removed", () => {
    let s = fresh();
    const id = byName(s, "Referral ask").id;
    s = remove(openEdit(s, id), id);
    expect(s.edit).toBeNull();
  });
  it("Undo with nothing removed does nothing", () => {
    const s = fresh();
    expect(undo(s)).toBe(s);
  });
});

// Made-up values only.
const BIZ = {
  business_name: "Test Roofing Co", business_owner_name: "Sam Tester", business_main_keyword: "Roofing",
  business_phone_number: "+1 (555) 010-0000", review_url: "https://reviews.example/test",
};
const NONE = { business_name: "", business_owner_name: "", business_main_keyword: "", business_phone_number: "", review_url: "" };

describe("send me a test", () => {
  it("shows the design's line with the business phone and sends nothing", () => {
    expect(sendTest(fresh()).test).toBe(true);
    expect(testLine(BIZ)).toBe(`Test text sent to ${BIZ.business_phone_number}.`);
    expect(testLine({ ...BIZ, business_phone_number: "  +1 (555) 010-0000 " })).toBe("Test text sent to +1 (555) 010-0000.");
  });
  it("with no business phone shows no made-up number and no dangling 'to'", () => {
    expect(testLine(NONE)).toBe("Test text sent.");
  });
  it("fills business details only from the business it is given", () => {
    expect(fillBusiness("{main keyword} {unknown}", BIZ)).toBe("Roofing {unknown}");
    expect(fillBusiness("Rate us: {review link}", BIZ)).toBe("Rate us: https://reviews.example/test");
  });
  it("with an empty business leaves nothing invented and no dangling punctuation", () => {
    const texts = [
      "Hi {first name}, this is {owner} from {business}. Thanks for reaching out. How can we help?",
      "You are booked, {first name}. {business} comes {day} at {time}.",
      "Hi {first name}, would you leave {business} a quick review? {review link}",
      "{main keyword} help, {first name}",
    ];
    const out = [...texts.map((x) => fillBusiness(x, NONE)), testLine(NONE)].join("\n");
    for (const bad of ["Northway", "Mike", "undefined", "null", "  ", " ,", " ()", "this is  "]) expect(out).not.toContain(bad);
    expect(fillBusiness(texts[0], NONE)).toBe("Hi {first name}. Thanks for reaching out. How can we help?");
    expect(fillBusiness(texts[1], NONE)).toBe("You are booked, {first name}. We come {day} at {time}.");
  });
});

describe("seasonal offer and referral reward", () => {
  it("the Promotion campaign's Does line holds the offer sentence of the design", () => {
    expect(byName(fresh(), "Promotion campaign").does).toBe('Texts old leads your seasonal offer: "{seasonal offer}"');
  });
  it("fills the offer and the reward when the business has them", () => {
    const biz = { ...BIZ, seasonal_offer_text: "10% off in spring", referral_reward_text: "You both get $25." };
    expect(doesText('Texts old leads your seasonal offer: "{seasonal offer}"', biz)).toBe('Texts old leads your seasonal offer: "10% off in spring"');
    expect(doesText("Hi {first name}, {seasonal offer}", biz)).toBe("Hi {first name}, 10% off in spring");
    expect(doesText("Reply YES. {referral reward}", biz)).toBe("Reply YES. You both get $25.");
  });
  it("leaves a missing offer or reward out: no raw braces, no placeholder note, no made-up value", () => {
    expect(doesText('Texts old leads your seasonal offer: "{seasonal offer}"', NONE)).toBe("Texts old leads your seasonal offer.");
    const line = doesText("Hi {first name}, {seasonal offer}", NONE);
    expect(line).toBe("Hi {first name}");
    expect(line).not.toMatch(/\{seasonal offer\}|no seasonal offer set|""/);
    const reward = doesText("Hi {first name}, know someone? Reply YES. {referral reward}", NONE);
    expect(reward).toBe("Hi {first name}, know someone? Reply YES.");
    expect(reward).not.toMatch(/\{referral reward\}|no referral reward set/);
    // a missing reward after a comma reads as a full sentence (mutation P25)
    expect(doesText("Thanks, {referral reward}", NONE)).toBe("Thanks.");
    // a text with no offer or reward token is left exactly as it is: no period added (mutation P26)
    expect(doesText("Hi {first name}", NONE)).toBe("Hi {first name}");
    expect(doesText("Thanks, {first name}", NONE)).toBe("Thanks, {first name}");
    expect(doesText('Texts old leads your seasonal offer: "{seasonal offer}"', { ...NONE, seasonal_offer_text: "   " })).toBe("Texts old leads your seasonal offer.");
    expect(doesText("One text the day after.", NONE)).toBe("One text the day after.");
  });
});

describe("where the cursor goes back to after the editor closes", () => {
  it("returns to the edited row, or the row a new automation made", () => {
    let s = fresh();
    const id = byName(s, "Job reminder").id;
    const open = openEdit(s, id);
    expect(returnTarget(open.edit, open.items, closeEdit(open).items)).toBe(id);
    const saved = save(open, { ...draftOf(byName(open, "Job reminder")), name: "Job heads-up" });
    expect(returnTarget(open.edit, open.items, saved.items)).toBe(id);
    s = openNew(fresh());
    const made = save(s, { ...emptyDraft(), name: "Spring offer" });
    expect(returnTarget(s.edit, s.items, made.items)).toBe(made.items.at(-1)!.id);
  });
  it("has nowhere to go for a cancelled new one, a removed row or a closed editor", () => {
    const s = openNew(fresh());
    expect(returnTarget(s.edit, s.items, closeEdit(s).items)).toBeNull();
    const id = byName(fresh(), "Owner ping").id;
    const e = openEdit(fresh(), id);
    expect(returnTarget(e.edit, e.items, remove(e, id).items)).toBeNull();
    expect(returnTarget(null, e.items, e.items)).toBeNull();
  });
});

describe("row swipe and menu actions (design uxActs / uxItems)", () => {
  it("offers the switch (swipe right), Edit, and Remove last as the danger item", () => {
    const a = byName(fresh(), "Owner ping");
    expect(rowActionSpecs(a, false)).toEqual([
      { label: "Owner ping", key: "toggle", swipe: "right" },
      { label: "Edit", key: "edit" },
      { label: "Remove", key: "ask", tone: "danger" },
    ]);
  });
  it("while asking Remove it?, offers the switch, Keep and Yes, remove", () => {
    const a = byName(fresh(), "Owner ping");
    expect(rowActionSpecs(a, true).map((x) => [x.label, x.key, x.tone ?? "", x.swipe ?? ""])).toEqual([
      ["Owner ping", "toggle", "", "right"], ["Keep", "keep", "", ""], ["Yes, remove", "remove", "danger", ""],
    ]);
    expect(rowActionSpecs(a, true).some((x) => (x.swipe as string | undefined) === "left")).toBe(false);
  });
});
