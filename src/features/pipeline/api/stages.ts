import type { GroupDef, StageDef } from "../types";

// The 11 stages in order, with the main button of a card in each and what the system does next.
// Source: docs/greenlane/build-prompt.md section 7. The "next" text only describes what the CRM's
// workflows do after the stage changes. This app never sends a text itself.
export const STAGES: readonly StageDef[] = [
  { index: 0, name: "New Lead", group: "Sales", button: { label: "Book visit", to: 2 }, next: "Follow-up texts today" },
  { index: 1, name: "Following Up", group: "Sales", button: { label: "Book visit", to: 2 }, next: "Chase texts run" },
  { index: 2, name: "Estimate Booked", group: "Sales", button: { label: "Visit done", to: 3 }, next: "Reminder texts go out" },
  { index: 3, name: "Quote to Send", group: "Sales", button: { label: "Approve", to: 4 }, next: "AI quote waits for you" },
  { index: 4, name: "Quote Sent", group: "Sales", button: { label: "Accepted", to: 5 }, next: "Follow-up texts run" },
  { index: 5, name: "Job to Schedule", group: "Delivery", button: { label: "Book job", to: 6 }, next: "Booking link sent" },
  { index: 6, name: "Job Scheduled", group: "Delivery", button: { label: "Job done", to: 7 }, next: "Reminder the day before" },
  {
    index: 7,
    name: "Job Done",
    group: "Delivery",
    button: { label: "Invoice", to: 8 },
    next: "Review request (1 hour after), referral ask (1 day after), invoice created",
  },
  { index: 8, name: "Payment Due", group: "Money", button: { label: "Mark paid", to: 9 }, next: "Payment reminders run" },
  { index: 9, name: "Check Back Later", group: "Later", button: { label: "Reopen", to: 0 }, next: "Check-in texts run" },
  { index: 10, name: "Lost", group: "Later", button: { label: "Reopen", to: 0 }, next: "Every text stopped" },
];

export const STAGE_COUNT = STAGES.length;
export const LAST_STAGE = STAGE_COUNT - 1;

export const JOB_DONE = 7;
export const PAYMENT_DUE = 8;
export const CHECK_BACK_LATER = 9;
export const LOST = 10;

// The four groups: the computer shows them as tabs, the phone as headings over the stage list.
export const GROUPS: readonly GroupDef[] = [
  { name: "Sales", sub: "Leads and quotes", first: 0, last: 4 },
  { name: "Delivery", sub: "Jobs", first: 5, last: 7 },
  { name: "Money", sub: "Payments", first: 8, last: 8 },
  { name: "Later", sub: "Check back and lost", first: 9, last: 10 },
];

export function groupOf(stage: number): number {
  return GROUPS.findIndex((g) => stage >= g.first && stage <= g.last);
}

// The second button of a card. "Job done" sits on every stage before Job Done (Job Scheduled
// already has it as its main button), because owners forget to move a card stage by stage.
// Job Done has "Paid", as in the design. Payment Due, Check Back Later and Lost have none.
export function secondButton(stage: number): { label: string; to: number } | null {
  if (stage < 6) return { label: "Job done", to: JOB_DONE };
  if (stage === JOB_DONE) return { label: "Paid", to: CHECK_BACK_LATER };
  return null;
}

// The trash icon (reason sheet) is on every card except Payment Due and Lost.
export function hasTrash(stage: number): boolean {
  return stage !== PAYMENT_DUE && stage !== LOST;
}
