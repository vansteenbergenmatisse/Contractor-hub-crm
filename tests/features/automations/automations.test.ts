import { describe, expect, it } from "vitest";
import {
  MADE_BY_YOU, MAX_NEW, STOP, WAIT, WHEN, askRemove, closeEdit, draftOf, emptyDraft, fillBusiness, groupByFolder, initialState, keep,
  openEdit, openNew, remove, runLabel, save, sendTest, testLine, toggle, totals, undo, whoLabel,
} from "../../../src/features/automations/api/automations";
import { mockAutomations } from "../../../src/features/automations/mock";

const fresh = () => initialState(mockAutomations());
const byName = (s: ReturnType<typeof fresh>, name: string) => s.items.find((a) => a.name === name)!;

describe("sample set", () => {
  it("has the 17 workflows of the design, all on, valid indexes", () => {
    const items = mockAutomations();
    expect(items).toHaveLength(17);
    for (const a of items) {
      expect(a.on).toBe(true);
      expect(WHEN[a.when]).toBeDefined();
      expect(WAIT[a.wait]).toBeDefined();
      expect(STOP[a.stop]).toBeDefined();
    }
  });
});

describe("totals and the switch", () => {
  it("counts running, off and all", () => {
    expect(totals(fresh().items)).toEqual({ on: 17, off: 0, all: 17 });
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
  it("hides an emptied folder and shows Made by you only when it has rows", () => {
    let s = fresh();
    s = remove(s, byName(s, "Lead capture").id);
    expect(groupByFolder(s.items).map((x) => x.folder)).not.toContain("Lead Capture");
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
    for (let i = 0; i < MAX_NEW; i++) s = save(openNew(s), { ...emptyDraft(), name: `New ${i}` });
    s = save(openNew(s), { ...emptyDraft(), name: "Third" });
    expect(s.err).toBe("This sample holds two new automations.");
    expect(s.items.filter((a) => a.mine)).toHaveLength(MAX_NEW);
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
  it("shows the line on screen and sends nothing", () => {
    expect(sendTest(fresh()).test).toBe(true);
    const line = testLine("Hi {first name}, {owner} from {business}.", BIZ);
    expect(line).toContain("Would text the business phone");
    expect(line).toContain(BIZ.business_phone_number);
    expect(line).toContain(`${BIZ.business_owner_name} from ${BIZ.business_name}`);
    expect(line).toContain("{first name}");
    expect(line).toContain("Nothing is sent");
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
    const out = [...texts.map((x) => fillBusiness(x, NONE)), testLine(texts[0], NONE)].join("\n");
    for (const bad of ["Northway", "Mike", "undefined", "null", "  ", " ,", " ()", "this is  "]) expect(out).not.toContain(bad);
    expect(fillBusiness(texts[0], NONE)).toBe("Hi {first name}, this is our team. Thanks for reaching out. How can we help?");
    expect(fillBusiness(texts[1], NONE)).toBe("You are booked, {first name}. Our team comes {day} at {time}.");
    expect(testLine("", NONE)).toBe("Would text the business phone. Nothing is sent in this preview.");
  });
});
