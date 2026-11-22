// Types shared inside the leads feature.
export type SourceKey = "call" | "form" | "text" | "gmb" | "fb" | "ig";

// call and reply: the lead waits on you. booked, auto, follow, called: it does not.
export type LeadStatus = "call" | "reply" | "booked" | "auto" | "follow" | "called";

export type Lead = {
  id: string;
  name: string;
  source: SourceKey;
  need: string;
  // Minutes waiting, as the backend sends it (never a ready-made label). Picks the chip color and
  // the words ("14 min", "2 days"). 0 when the lead does not wait.
  minutesWaiting: number;
  // When a lead that does not wait came in, as the row shows it ("Yesterday", "Tuesday").
  // Proposal, not existing: Phase 3 derives it from the contact's date added.
  received?: string;
  address: string;
  status: LeadStatus;
};

// A lead added by hand on this screen.
export type AddedLead = { id: string; name: string; sub: string };

export type FormField = "name" | "phone" | "email" | "addr" | "need";
export type FormValues = Record<FormField, string>;
export type FormErrors = { name: string; phone: string; email: string };
export type FocusField = keyof FormErrors;

export type WaitFilter = "all" | "warn" | "bad" | "hot";
export type WaitLevel = "warn" | "bad" | "hot";
export type OldState = "idle" | "ask" | "sent";

export type LeadsState = {
  // Current status per lead id, and the status each lead started with (what Undo booking returns to).
  status: Record<string, LeadStatus>;
  initial: Record<string, LeadStatus>;
  filter: WaitFilter;
  // The hand-added leads on screen: the newest 3, as in the design.
  added: AddedLead[];
  // Every lead added by hand on this screen (the sources panel's "Added by you" counts them all).
  nAdd: number;
  auto: boolean;
  old: OldState;
  sheet: boolean;
  form: FormValues;
  errors: FormErrors;
  // The field the cursor moves to after a failed submit. `tick` makes a repeat of the same field fire again.
  focus: { field: FocusField; tick: number } | null;
};

export type LeadsAction =
  | { type: "call"; id: string }
  | { type: "book"; id: string }
  | { type: "filter"; filter: WaitFilter }
  | { type: "openAdd" }
  | { type: "closeAdd" }
  | { type: "field"; field: FormField; value: string }
  | { type: "submit" }
  | { type: "toggleAuto" }
  | { type: "old"; to: OldState };

export type Summary = {
  tone: "warn" | "bad" | "hot" | "calm";
  a: string;
  b: string;
  // Empty when the summary has no button.
  button: string;
  // The lead the button acts on: a text opens the Inbox, a call marks the lead called.
  target: { id: string; kind: "reply" | "call" } | null;
};
