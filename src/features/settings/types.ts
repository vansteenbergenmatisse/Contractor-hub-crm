// Types shared inside the settings feature.
export type SectionKey = "biz" | "colors" | "conn" | "choice" | "soon";

// One GoHighLevel custom value, key to value. Keys are never renamed, only values change.
export type CustomValues = Record<string, string>;

export type Field = { key: string; label: string };
export type ColorGroup = { heading: string; fields: Field[] };

export type Connection = {
  name: string;
  sub: string;
  need: string;
  steps: string[];
};

// "unknown": no API gives this row's status (build prompt section 6); the row says "Not available yet".
export type ConnectionState = "connected" | "not-connected" | "unknown";

export type ConnectionStatus = {
  state: ConnectionState;
  // Short note shown on the chip of a connected row, for example "Connected: Google Calendar".
  note?: string;
  // Phone only: shows the "A2P verified" line on a connected row.
  a2pVerified?: boolean;
};

// The first value that stops a save: its key, the message and the section that holds it.
export type Problem = { key: string; message: string; section: SectionKey };

export type SearchFilter = {
  active: boolean;
  any: boolean;
  sections: Record<SectionKey, boolean>;
  items: Record<string, boolean>;
};

// Saving to the account. The page gets `SaveValues` from outside: this feature makes no network call.
export type ValueChange = { key: string; expected: string; value: string };
export type SaveStatus = "saved" | "unchanged" | "conflict" | "invalid" | "missing" | "duplicate" | "denied" | "rejected" | "permission" | "retry" | "unknown" | "busy";
export type SaveResult = { key: string; status: SaveStatus; current?: string };
export type SaveAnswer = { kind: "results"; results: SaveResult[] } | { kind: "limited" } | { kind: "failed" };
export type SaveValues = (changes: ValueChange[]) => Promise<SaveAnswer>;
