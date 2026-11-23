import type { Reason } from "@/features/app-shell";

// Types shared inside the pipeline feature.

export type GroupName = "Sales" | "Delivery" | "Money" | "Later";

// One of the 11 stages. `index` is its position, 0 to 10.
export type StageDef = {
  index: number;
  name: string;
  group: GroupName;
  // The main button of a card in this stage and the stage it moves the card to.
  button: { label: string; to: number };
  // What the system does next. A description only: the app never does it (workflows in the CRM do).
  next: string;
};

export type GroupDef = {
  name: GroupName;
  sub: string;
  first: number;
  last: number;
};

// A sample customer card (mock data in Phase 2).
export type MockCard = {
  name: string;
  init: string;
  service: string;
  address: string;
  // Stage the card starts in.
  stage: number;
  // The time or status line a card shows while it sits in its start stage.
  since: string;
  amount: string;
  // Only for cards that start in Quote to Send: does the quote still need a service and price?
  quote?: "need" | "ready";
  opened: boolean;
  returning: boolean;
  review: boolean;
};

// What the board reads from the live Quotes state: a quote is found by its customer's name (Phase 2;
// Phase 3 links by record id). The full quote type comes from the quotes feature.
export type LiveQuote = { name: string; status: string };

// The last move on the board. `undo` is true when the move itself was an Undo.
export type LastMove = { i: number; from: number; to: number; pseq: number; undo: boolean };

export type LostReason = Exclude<Reason, "later">;

export type BoardState = {
  // Stage of every card.
  sg: number[];
  // Order the cards moved in (0 = never moved). The latest move sorts first in its stage.
  seq: number[];
  // Count of moves so far.
  n: number;
  // The stage in view, and on a phone whether one stage is open (false = the list of stages).
  stg: number;
  open: boolean;
  last: LastMove | null;
  // Motion only: which class of a pair to use, so a repeated move plays its animation again.
  bumps: number;
  sw: number;
  gch: boolean;
  ev: string;
  // Lost reason by card index.
  rs: Record<number, LostReason>;
  // The move count of a move made by a send (it has no Undo). -1 = none.
  noUndoAt: number;
};

export type Tag = { cls: string; text: string };

export type PrimaryKind = "move" | "send-quote" | "send-invoice" | "add-price";

export type CardView = {
  i: number;
  card: MockCard;
  stage: number;
  className: string;
  timeText: string;
  autoText: string;
  showUndo: boolean;
  primary: { label: string; kind: PrimaryKind; to: number };
  second: { label: string; to: number } | null;
  calendar: boolean;
  trash: boolean;
  seeQuote: boolean;
  tags: [Tag | null, Tag | null];
};

export type StubView = {
  className: string;
  name: string;
  to: string;
  auto: string;
  showClassName: string;
};

// The real, read-only board. Stages come from the tenant's own pipeline at runtime.

// What the injected reader answers (the server page passes it; this feature never calls the CRM).
export type PipelineBoardAnswer =
  | {
      ok: true;
      pipelines: readonly { id: string; name: string; stages: readonly { id: string; name: string }[] }[];
      pipelineId: string | null;
      opportunities: readonly {
        id: string;
        name: string | null;
        contactName: string | null;
        stageId: string;
        monetaryValue: number | null;
        lastStageChangeAt: string | null;
      }[];
      dropped: number;
      complete: boolean;
    }
  | { ok: false; reason: "reconnect" | "unavailable" };

export type PipelineBoardReader = (tenantId: string, pipelineId?: string) => Promise<PipelineBoardAnswer>;

export type LiveCard = { id: string; name: string; init: string; detail: string; amount: string; since: string };
export type LiveColumn = { id: string; name: string; cards: LiveCard[] };
export type PipelineChoice = { id: string; name: string };

// What one load gives the page. Never sample data. `complete`: no open deal lies beyond these.
// `dropped`: malformed rows left out.
export type PipelineResult =
  | { state: "ready"; pipelines: PipelineChoice[]; pipelineId: string; columns: LiveColumn[]; loadedAt: string; complete: boolean; dropped: number }
  | { state: "empty"; pipelines: PipelineChoice[]; pipelineId: string | null }
  | { state: "reconnect" }
  | { state: "unavailable" };
