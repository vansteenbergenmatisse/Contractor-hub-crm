// Types shared inside the automations feature.
export type Who = "auto" | "you" | "ok";

// One row: a workflow of the sub-account as the page shows it (When / Does / Stops).
// `when`, `wait` and `stop` are indexes into WHEN, WAIT and STOP in api/automations.ts.
export type Automation = {
  id: string;
  folder: string;
  name: string;
  when: number;
  wait: number;
  does: string;
  stop: number;
  who: Who;
  // Runs this week. -1 means made just now and not run yet.
  ran: number;
  msg: string;
  on: boolean;
  gone: boolean;
  mine: boolean;
  changed: boolean;
};

// What the editor holds while it is open.
export type Draft = { name: string; when: number; wait: number; msg: string; stop: number };

// "new" is the editor for a new automation; an id edits that row; null is closed.
export type EditTarget = string | null;

export type PageState = {
  items: Automation[];
  edit: EditTarget;
  // The row that asks "Remove it?".
  conf: string | null;
  // The row removed last, for Undo.
  last: string | null;
  err: string;
  test: boolean;
};

export type FolderGroup = { folder: string; items: Automation[] };

// Real workflows (read-only). The shape the highlevel adapter hands over; declared here so this
// feature does not depend on the adapter.
export type WorkflowRow = { id: string; name: string | null; status: string | null };
export type AutomationsReader = (tenantId: string) => Promise<
  | { ok: true; workflows: WorkflowRow[]; dropped: number; foreign?: number; complete: boolean }
  | { ok: false; reason: "reconnect" | "unavailable" | "not-enabled" }
>;

export type LiveWorkflow = { id: string; name: string; status: "published" | "draft" | "unknown" };
export type AutomationsResult =
  | { state: "ready"; workflows: LiveWorkflow[]; totals: { published: number; draft: number; all: number }; complete: boolean; dropped: number; loadedAt: string }
  | { state: "empty" }
  | { state: "reconnect" }
  | { state: "unavailable" }
  | { state: "not-enabled" };
