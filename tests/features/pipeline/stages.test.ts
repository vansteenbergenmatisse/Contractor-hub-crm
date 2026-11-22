import { describe, expect, it } from "vitest";
import { GROUPS, STAGES, groupOf, hasTrash, secondButton } from "@/features/pipeline";

// The table of docs/greenlane/build-prompt.md section 7, written out as plain data. The next line of
// Job Done uses the design's wording (logic AUTO[7]), which ranks above the build prompt.
const SECTION_7: ReadonlyArray<readonly [string, string, string, string]> = [
  ["New Lead", "Book visit", "Estimate Booked", "Follow-up texts today"],
  ["Following Up", "Book visit", "Estimate Booked", "Chase texts run"],
  ["Estimate Booked", "Visit done", "Quote to Send", "Reminder texts go out"],
  ["Quote to Send", "Approve", "Quote Sent", "AI quote waits for you"],
  ["Quote Sent", "Accepted", "Job to Schedule", "Follow-up texts run"],
  ["Job to Schedule", "Book job", "Job Scheduled", "Booking link sent"],
  ["Job Scheduled", "Job done", "Job Done", "Reminder the day before"],
  ["Job Done", "Invoice", "Payment Due", "Review request sent"],
  ["Payment Due", "Mark paid", "Check Back Later", "Payment reminders run"],
  ["Check Back Later", "Reopen", "New Lead", "Check-in texts run"],
  ["Lost", "Reopen", "New Lead", "Every text stopped"],
];

describe("stage table", () => {
  it("has the 11 stages in order", () => {
    expect(STAGES.map((s) => s.name)).toEqual(SECTION_7.map((r) => r[0]));
    STAGES.forEach((s, k) => expect(s.index).toBe(k));
  });

  it.each(SECTION_7.map((row, k) => [k, ...row] as const))("stage %i %s: main button, target and next line", (k, name, label, target, next) => {
    const stage = STAGES[k];
    expect(stage.name).toBe(name);
    expect(stage.button.label).toBe(label);
    expect(STAGES[stage.button.to].name).toBe(target);
    expect(stage.next).toBe(next);
  });

  it("has four groups: Sales, Delivery, Money, Later", () => {
    expect(GROUPS.map((g) => [g.name, STAGES[g.first].name, STAGES[g.last].name])).toEqual([
      ["Sales", "New Lead", "Quote Sent"],
      ["Delivery", "Job to Schedule", "Job Done"],
      ["Money", "Payment Due", "Payment Due"],
      ["Later", "Check Back Later", "Lost"],
    ]);
    STAGES.forEach((s) => expect(GROUPS[groupOf(s.index)].name).toBe(s.group));
  });

  it("puts a Job done button on every stage before Job Done", () => {
    for (let k = 0; k < 6; k++) expect(secondButton(k)).toEqual({ label: "Job done", to: 7 });
    // Job Scheduled already has Job done as its main button.
    expect(STAGES[6].button).toEqual({ label: "Job done", to: 7 });
    expect(secondButton(6)).toBeNull();
    expect(secondButton(8)).toBeNull();
    expect(secondButton(9)).toBeNull();
    expect(secondButton(10)).toBeNull();
  });

  it("has no trash icon on Payment Due and Lost", () => {
    STAGES.forEach((s) => expect(hasTrash(s.index)).toBe(s.index !== 8 && s.index !== 10));
  });
});
