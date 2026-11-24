import type { CustomValueDetail, CustomValueRead, CustomValueWriteOutcome } from "@/features/highlevel";
import { isClearableKey, isSettingsKeyAllowed, validateValues, type CustomValues, type SaveResult, type SaveStatus, type ValueChange } from "@/features/settings";
import { isSafeToWrite } from "./value-rules";

const UNITS_AT_ONCE = 3;
// With 10-second calls, no new batch after 25 seconds and no restore after 35 leave room for the last
// write and the confirming read inside the route's 60 seconds.
const TIME_BUDGET_MS = 25_000;
const RESTORE_CUTOFF_MS = 35_000;
const COLOR_PAIR = ["main_color", "text_on_main_color"] as const;
// HighLevel can answer a read just after a 2xx with the old value. A proposal, not a measured delay.
const READ_BACK_WAITS_MS = [500, 1_000, 2_000];

export type AuditStart = { tenantId: string; actorId: string; key: string; previousValue: string; newValue: string };
export type AuditOutcome = "saved" | "rejected" | "permission" | "failed" | "unknown" | "reverted";

export type SaveDeps = {
  read: (tenantId: string) => Promise<CustomValueRead>;
  update: (tenantId: string, target: CustomValueDetail, value: string) => Promise<CustomValueWriteOutcome>;
  begin: (row: AuditStart) => Promise<string>;
  finish: (id: string, outcome: AuditOutcome) => Promise<void>;
  invalidate: (tenantId: string) => void;
  // One save per tenant at a time. Null: another save holds the lease.
  claim: (tenantId: string) => Promise<string | null>;
  release: (tenantId: string, holder: string) => Promise<void>;
  now: () => number;
  // Pause between confirming reads. Without it there is one confirming read.
  wait?: (ms: number) => Promise<void>;
};

type Input = { tenantId: string; actorId: string; changes: readonly ValueChange[] };
type Candidate = { key: string; value: string; previous: string; target: CustomValueDetail };
// `unresolved`: part of a color pair whose final state cannot be proven, so it is never called saved.
type Written = { candidate: Candidate; auditId: string; http: CustomValueWriteOutcome; unresolved: boolean; restoreAuditId: string | null; restoreHttp: CustomValueWriteOutcome | null };
type Results = Map<string, SaveResult>;

const valuesOf = (rows: readonly CustomValueDetail[]): CustomValues => Object.fromEntries(rows.map((row) => [row.key, row.value.trim()]));

// The form's rules against HighLevel's current values. A bad value is taken out and the rest checked
// again. The contrast rule names main_color but judges a pair, so both sides of the pair are refused.
function refusedByValidation(candidates: readonly Candidate[], current: CustomValues): Set<string> {
  const next: CustomValues = { ...current };
  for (const { key, value } of candidates) next[key] = value;
  const refused = new Set<string>();
  const submitted = new Set(candidates.map((c) => c.key));
  for (let i = 0; i <= candidates.length; i += 1) {
    const problem = validateValues(next, current);
    if (!problem) return refused;
    const keys = problem.key === "main_color" ? [...COLOR_PAIR] : [problem.key];
    for (const key of keys) {
      if (submitted.has(key)) refused.add(key);
      next[key] = current[key] ?? "";
    }
  }
  // The rules still object after every value was taken out: write nothing.
  return submitted;
}

// No audit row, no write: every change in a client's account must be traceable and undoable.
async function writeAudited(input: Input, candidate: Candidate, deps: SaveDeps): Promise<Written | null> {
  let auditId: string;
  try {
    auditId = await deps.begin({
      tenantId: input.tenantId, actorId: input.actorId, key: candidate.key,
      previousValue: candidate.previous, newValue: candidate.value,
    });
  } catch {
    console.error("Settings save failed: step=audit-start");
    return null;
  }
  let http: CustomValueWriteOutcome = "retry";
  try {
    http = await deps.update(input.tenantId, candidate.target, candidate.value);
  } catch {
    console.error("Settings save failed: step=update");
  }
  return { candidate, auditId, http, unresolved: false, restoreAuditId: null, restoreHttp: null };
}

async function closeAudit(id: string, outcome: AuditOutcome, deps: SaveDeps) {
  try {
    await deps.finish(id, outcome);
  } catch {
    console.error("Settings save failed: step=audit-finish");
  }
}

async function restore(input: Input, written: Written, deps: SaveDeps): Promise<void> {
  const { candidate } = written;
  try {
    written.restoreAuditId = await deps.begin({
      tenantId: input.tenantId, actorId: input.actorId, key: candidate.key,
      previousValue: candidate.value, newValue: candidate.previous,
    });
  } catch {
    console.error("Settings save failed: step=audit-start");
    written.unresolved = true;
    return;
  }
  written.restoreHttp = "no_answer";
  try {
    written.restoreHttp = await deps.update(input.tenantId, candidate.target, candidate.previous);
  } catch {
    console.error("Settings save failed: step=restore");
  }
}

// The two colors must not end up half changed: a new main color with the old text can be unreadable.
// The first is restored only when the second certainly did not apply and nobody edited the first.
async function writePair(input: Input, first: Candidate, second: Candidate, started: number, deps: SaveDeps, out: Results): Promise<Written[]> {
  const a = await writeAudited(input, first, deps);
  if (!a) {
    out.set(first.key, { key: first.key, status: "retry" });
    out.set(second.key, { key: second.key, status: "retry" });
    return [];
  }
  if (a.http !== "saved") {
    a.unresolved = a.http === "no_answer";
    out.set(second.key, { key: second.key, status: "retry" });
    return [a];
  }
  const b = await writeAudited(input, second, deps);
  if (b?.http === "saved") return [a, b];
  if (!b) out.set(second.key, { key: second.key, status: "retry" });
  const list = b ? [a, b] : [a];
  const fresh = await safeRead(input.tenantId, deps);
  if (!fresh.ok) {
    a.unresolved = true;
    if (b) b.unresolved = b.http === "no_answer";
    return list;
  }
  const now = valuesOf(fresh.values);
  if (b && now[second.key] === second.value) return list;
  if (b?.http === "no_answer") {
    a.unresolved = true;
    b.unresolved = true;
    return list;
  }
  if (now[first.key] !== first.value) {
    a.unresolved = true;
    return list;
  }
  if (deps.now() - started > RESTORE_CUTOFF_MS) {
    a.unresolved = true;
    return list;
  }
  // Restoring an empty value would blank it, which this save never does.
  if (!first.previous.trim()) {
    a.unresolved = true;
    return list;
  }
  await restore(input, a, deps);
  return list;
}

async function safeRead(tenantId: string, deps: SaveDeps): Promise<CustomValueRead> {
  try {
    return await deps.read(tenantId);
  } catch {
    return { ok: false, reason: "retry" };
  }
}

// `current`: only on "unknown" when the read shows a third value, neither the one sent nor the old one,
// and HighLevel answered every write for this key.
type Settled = { status: SaveStatus; audit: AuditOutcome; restoreAudit: AuditOutcome; current?: string };

// What HighLevel holds now decides the result, not the answer to the PUT. No answer with the old value
// is unknown, because the write can still land. A third value is unknown too, and carries that value
// so the owner sees what the account holds instead of only "reload".
function confirmed(written: Written, now: CustomValues | null): Settled {
  const unknown: Settled = { status: "unknown", audit: "unknown", restoreAudit: "unknown" };
  if (!now) return unknown;
  const { candidate, http, unresolved, restoreAuditId, restoreHttp } = written;
  const current = now[candidate.key];
  const previous = candidate.previous.trim();
  // A write or restore with no answer can still land, so a third value read now may not last: the
  // owner gets "could not confirm" instead, and the page keeps its baseline.
  const mayLand = http === "no_answer" || restoreHttp === "no_answer";
  const third: Settled = !mayLand && current !== undefined && current !== previous && current !== candidate.value ? { ...unknown, current } : unknown;
  if (restoreAuditId) return current === previous && restoreHttp !== "no_answer" ? { status: "retry", audit: "reverted", restoreAudit: "saved" } : third;
  if (unresolved) return third;
  if (current === candidate.value) return { status: "saved", audit: "saved", restoreAudit: "saved" };
  if (current !== previous) return third;
  if (http === "saved" || http === "no_answer") return unknown;
  return { status: http, audit: http === "retry" ? "failed" : http, restoreAudit: "failed" };
}

// Only a write HighLevel accepted is read again, and only while the read shows no answer or the old
// value. A timeout stays unknown, and a third value is somebody else's edit.
function awaitsConfirmation({ candidate, http, unresolved, restoreAuditId }: Written, now: CustomValues | null): boolean {
  if (http !== "saved" || unresolved || restoreAuditId) return false;
  const current = now?.[candidate.key];
  return current === undefined || current === candidate.previous.trim();
}

// The newest successful read. Each one is a real call to HighLevel, so only it can confirm a value.
async function confirmingRead(tenantId: string, written: readonly Written[], started: number, deps: SaveDeps): Promise<CustomValues | null> {
  let after = await safeRead(tenantId, deps);
  if (!deps.wait) return after.ok ? valuesOf(after.values) : null;
  for (const ms of READ_BACK_WAITS_MS) {
    const now = after.ok ? valuesOf(after.values) : null;
    if (!written.some((item) => awaitsConfirmation(item, now))) break;
    if (deps.now() - started > RESTORE_CUTOFF_MS) break;
    await deps.wait(ms);
    const next = await safeRead(tenantId, deps);
    if (next.ok) after = next;
  }
  return after.ok ? valuesOf(after.values) : null;
}

// One side of the pair stopped before any write: the other waits too, so the two never end up half
// changed. A side that already holds the wanted value does not stop it.
function withoutHalfPair(writable: readonly Candidate[], out: Results): Candidate[] {
  const pair: readonly string[] = COLOR_PAIR;
  const stopped = pair.some((key) => {
    const status = out.get(key)?.status;
    return status !== undefined && status !== "unchanged";
  });
  if (!stopped) return [...writable];
  return writable.filter((c) => {
    if (!pair.includes(c.key)) return true;
    out.set(c.key, { key: c.key, status: "retry" });
    return false;
  });
}

function toUnits(candidates: readonly Candidate[]): Candidate[][] {
  const main = candidates.find((c) => c.key === COLOR_PAIR[0]);
  const text = candidates.find((c) => c.key === COLOR_PAIR[1]);
  if (!main || !text) return candidates.map((c) => [c]);
  return [[main, text], ...candidates.filter((c) => c !== main && c !== text).map((c) => [c])];
}

// A later batch starts from a fresh read: a value edited in HighLevel meanwhile is left alone. A pair
// with one changed side is skipped whole.
function stillClean(unit: readonly Candidate[], rows: readonly CustomValueDetail[], out: Results): Candidate[] | null {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const fresh: Candidate[] = [];
  let clean = true;
  for (const candidate of unit) {
    const row = byKey.get(candidate.key);
    const now = row?.value.trim();
    if (!row || now === undefined) {
      out.set(candidate.key, { key: candidate.key, status: "missing" });
      clean = false;
    } else if (now === candidate.value) {
      out.set(candidate.key, { key: candidate.key, status: "unchanged" });
      clean = false;
    } else if (now !== candidate.previous.trim()) {
      out.set(candidate.key, { key: candidate.key, status: "conflict", current: now });
      clean = false;
    } else fresh.push({ ...candidate, target: row });
  }
  if (clean) return fresh;
  for (const candidate of unit) if (!out.has(candidate.key)) out.set(candidate.key, { key: candidate.key, status: "retry" });
  return null;
}

async function runSave(input: Input, deps: SaveDeps, startedAt?: number): Promise<{ results: SaveResult[]; keepLease: boolean }> {
  const { tenantId, changes } = input;
  const started = startedAt ?? deps.now();
  const read = await safeRead(tenantId, deps);
  if (!read.ok) {
    const status = read.reason;
    return { results: changes.map(({ key }) => ({ key, status })), keepLease: false };
  }
  const byKey = new Map(read.values.map((row) => [row.key, row]));
  const current = valuesOf(read.values);
  const listedTwice = new Set((read.duplicates ?? []).map((row) => row.key));
  const out: Results = new Map();
  const candidates: Candidate[] = [];
  for (const change of changes) {
    const { key } = change;
    const value = change.value.trim();
    // The allowlist comes first, so the answer never reveals whether a denied key exists.
    if (!isSettingsKeyAllowed(key)) out.set(key, { key, status: "denied" });
    else if (listedTwice.has(key)) out.set(key, { key, status: "duplicate" });
    else {
      const target = byKey.get(key);
      const now = target?.value.trim();
      if (!target || now === undefined) out.set(key, { key, status: "missing" });
      // Empty only with the review step's mark, never for a required value; a mark on a real value is refused.
      else if (value ? change.clear === true || !isSafeToWrite(key, value) : change.clear !== true || !isClearableKey(key)) out.set(key, { key, status: "invalid" });
      else if (now === value) out.set(key, { key, status: "unchanged" });
      else if (now !== change.expected.trim()) out.set(key, { key, status: "conflict", current: now });
      else candidates.push({ key, value, previous: target.value, target });
    }
  }
  const refused = refusedByValidation(candidates, current);
  const writable = candidates.filter((c) => {
    if (!refused.has(c.key)) return true;
    out.set(c.key, { key: c.key, status: "invalid" });
    return false;
  });
  const units = toUnits(withoutHalfPair(writable, out));
  const written: Written[] = [];
  let keepLease = false;
  for (let i = 0; i < units.length; i += UNITS_AT_ONCE) {
    let batch: Candidate[][] = units.slice(i, i + UNITS_AT_ONCE);
    if (i > 0) {
      const fresh = deps.now() - started > TIME_BUDGET_MS ? null : await safeRead(tenantId, deps);
      if (!fresh?.ok) {
        for (const candidate of units.slice(i).flat()) out.set(candidate.key, { key: candidate.key, status: "retry" });
        break;
      }
      batch = batch.flatMap((unit) => {
        const clean = stillClean(unit, fresh.values, out);
        return clean ? [clean] : [];
      });
    }
    const done = await Promise.all(batch.map(async (unit) => {
      if (unit.length === 2) return writePair(input, unit[0], unit[1], started, deps, out);
      const one = await writeAudited(input, unit[0], deps);
      if (!one) out.set(unit[0].key, { key: unit[0].key, status: "retry" });
      return one ? [one] : [];
    }));
    written.push(...done.flat());
  }
  if (written.length > 0) {
    const now = await confirmingRead(tenantId, written, started, deps);
    for (const item of written) {
      const { status, audit, restoreAudit, current } = confirmed(item, now);
      out.set(item.candidate.key, current === undefined ? { key: item.candidate.key, status } : { key: item.candidate.key, status, current });
      await closeAudit(item.auditId, audit, deps);
      if (item.restoreAuditId) await closeAudit(item.restoreAuditId, restoreAudit, deps);
      // A call with no answer can still land: the lease stays until it expires, so no later save races it.
      if (status !== "saved" && (item.http === "no_answer" || item.restoreHttp === "no_answer")) keepLease = true;
    }
    try {
      deps.invalidate(tenantId);
    } catch {
      console.error("Settings save failed: step=cache");
    }
  }
  return { results: changes.map(({ key }) => out.get(key) as SaveResult), keepLease };
}

// Saves the owner's changes to the tenant's sub-account. Never creates or deletes a custom value and
// never overwrites a value that changed in HighLevel after the owner loaded it. `startedAt`: a caller
// that already spent part of the request passes its own start, so the time limits cover the whole of it.
export async function saveCustomValues(input: Input, deps: SaveDeps, startedAt?: number): Promise<{ results: SaveResult[] }> {
  let holder: string | null;
  try {
    holder = await deps.claim(input.tenantId);
  } catch {
    console.error("Settings save failed: step=lease");
    return { results: input.changes.map(({ key }) => ({ key, status: "retry" as const })) };
  }
  if (!holder) return { results: input.changes.map(({ key }) => ({ key, status: "busy" as const })) };
  let keepLease = false;
  try {
    const answer = await runSave(input, deps, startedAt);
    keepLease = answer.keepLease;
    return { results: answer.results };
  } finally {
    if (!keepLease) await deps.release(input.tenantId, holder).catch(() => console.error("Settings save failed: step=lease-release"));
  }
}
