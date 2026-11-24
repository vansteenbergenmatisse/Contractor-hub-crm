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
// `clear`: the owner confirmed emptying this value on a review step. Without it an empty value is refused.
export type ValueChange = { key: string; expected: string; value: string; clear?: true };
export type SaveStatus = "saved" | "unchanged" | "conflict" | "invalid" | "missing" | "duplicate" | "denied" | "rejected" | "permission" | "retry" | "unknown" | "busy";
export type SaveResult = { key: string; status: SaveStatus; current?: string };
export type SaveAnswer = { kind: "results"; results: SaveResult[] } | { kind: "limited" } | { kind: "failed" };
// `unlocked`: the protected folder this save was made in (after its extra unlock step). The server
// writes a protected folder's keys only in a save that names that folder.
export type SaveOptions = { unlocked: string };
export type SaveValues = (changes: ValueChange[], options?: SaveOptions) => Promise<SaveAnswer>;

// The account's phone numbers as the server read them. This feature makes no network call.
export type PhoneNumbersView =
  | { state: "ok"; numbers: { number: string; name: string | null }[]; complete: boolean }
  | { state: "no-access" | "not-connected" | "inactive" | "unavailable" };
// A promise while the server is still reading, so a slow phone read never holds up the page.
export type PhoneNumbersSource = PhoneNumbersView | undefined | Promise<PhoneNumbersView | undefined>;

// Change image. The page gets the uploader from outside: this feature makes no network call.
export type ImageKind = "svg" | "photo";
export type ImageStatus =
  | "saved" | "conflict" | "missing" | "duplicate" | "busy" | "needs_approval" | "connection"
  | "rejected" | "bad_host" | "hash_mismatch" | "unknown" | "retry" | "limited" | "invalid" | "failed"
  | "not_found" | "ambiguous" | "library_limit" | "format_mismatch";
export type ImageFormat = "webp" | "png" | "jpeg" | "svg";
// What happened to the old file after the image changed.
// `unproven`: the new file's name, folder or bytes could not be confirmed. `same`: nothing to change.
// `none`: the value was empty, so there was no old file.
export type ImageOldFile = "trashed" | "in_use" | "kept" | "unconfirmed" | "unproven" | "same" | "none";
export type SvgProblemCode = "script" | "outside_link" | "embedded" | "animation" | "doctype" | "style" | "reference" | "too_complex" | "unsupported" | "broken";
// `leftover`: the change failed and the file it uploaded could not be removed.
export type ImageAnswer = { status: ImageStatus; url?: string; current?: string; format?: ImageFormat; oldFile?: ImageOldFile; leftover?: boolean; svgProblem?: SvgProblemCode };
// `unlock`: the protected folder the change is made in (only there).
export type ImageUploader = (input: { key: string; expected: string; blob: Blob; unlock?: string }) => Promise<ImageAnswer>;
export type PreparedImage = { ok: true; blob: Blob; previewUrl: string; summary: string } | { ok: false; message: string };
export type PrepareImage = (file: File, kind: ImageKind, format?: Exclude<ImageFormat, "svg">) => Promise<PreparedImage>;
