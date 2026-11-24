// Types shared inside the leads feature.
export type SourceKey = "call" | "form" | "text" | "gmb" | "fb" | "ig";

// call and reply: the lead waits on you. booked, auto, follow, called: it does not.
// new: a real contact. No stored status or wait exists yet, so the row claims neither.
export type LeadStatus = "call" | "reply" | "booked" | "auto" | "follow" | "called" | "new";

export type Lead = {
  id: string;
  name: string;
  // Null: the contact's source is not an exact match for one of the six channels.
  source: SourceKey | null;
  need: string;
  // Minutes waiting, as the backend sends it (never a ready-made label). Picks the chip color and
  // the words ("14 min", "2 days"). 0 when the lead does not wait.
  minutesWaiting: number;
  // When a lead that does not wait came in, as the row shows it ("Yesterday", "Tuesday").
  received?: string;
  // The contact's date added (ISO). The page turns it into `received` in the viewer's time zone.
  receivedAt?: string;
  address: string;
  status: LeadStatus;
  // Set only for a channel `source` cannot name (Email, Bing Places, Google Ads, Added by you).
  origin?: LeadOrigin;
};

// Where a lead came from, as the source breakdown lists it. Unmatched values are "unknown".
export type LeadOrigin = "call" | "text" | "email" | "website" | "fb" | "ig" | "gmb" | "bing" | "gads" | "you" | "unknown";
export type SourcePeriod = "all" | "today" | "week" | "month";


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
  // The same leads per channel the owner picked. Absent until the first one is added.
  addedBy?: Partial<Record<LeadOrigin, number>>;
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
  | { type: "submit"; origin?: string; channel?: LeadOrigin }
  | { type: "toggleAuto" }
  | { type: "old"; to: OldState }
  | { type: "sync"; leads: readonly Lead[] };

export type Summary = {
  tone: "warn" | "bad" | "hot" | "calm";
  a: string;
  b: string;
  // Empty when the summary has no button.
  button: string;
  // The lead the button acts on: a text opens the Inbox, a call marks the lead called.
  target: { id: string; kind: "reply" | "call" } | null;
};

// One contact as the server's reader hands it over. The page injects the reader.
export type LeadContact = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  source: string | null;
  dateAdded: string;
};

export type LeadContactsRead =
  | { ok: true; contacts: readonly LeadContact[]; dropped: number; complete: boolean }
  | { ok: false; reason: "reconnect" | "unavailable" };

export type LeadContactsReader = (tenantId: string) => Promise<LeadContactsRead>;

// What one load of the leads gives a page. Never sample data.
// `complete`: no contact lies beyond this page. `dropped`: malformed rows left out.
export type LeadsResult =
  | { state: "ready"; leads: Lead[]; loadedAt: string; complete: boolean; dropped: number }
  | { state: "empty" }
  | { state: "reconnect" }
  | { state: "unavailable" };

export type SourceCounts = { byKey: Record<SourceKey, number>; unlabelled: number; total: number };
