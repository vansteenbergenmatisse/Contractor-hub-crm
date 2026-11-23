import type { CustomValueDetail, CustomValueRead, CustomValueWriteOutcome } from "@/features/highlevel";
import { isSettingsKeyAllowed, validateValues, type CustomValues, type SaveResult, type SaveStatus, type ValueChange } from "@/features/settings";
import { isSafeToWrite } from "./value-rules";

const UNITS_AT_ONCE = 3;
// No new batch starts after this. With 10-second calls the save ends inside the route's 60 seconds.
const TIME_BUDGET_MS = 25_000;
const COLOR_PAIR = ["main_color", "text_on_main_color"] as const;

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
};

type Input = { tenantId: string; actorId: string; changes: readonly ValueChange[] };
type Candidate = { key: string; value: string; previous: string; target: CustomValueDetail };
type Written = { candidate: Candidate; auditId: string; http: CustomValueWriteOutcome; restored: boolean };
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
  return { candidate, auditId, http, restored: false };
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
  let auditId: string;
  try {
    auditId = await deps.begin({
      tenantId: input.tenantId, actorId: input.actorId, key: candidate.key,
      previousValue: candidate.value, newValue: candidate.previous,
    });
  } catch {
    console.error("Settings save failed: step=audit-start");
    return;
  }
  let outcome: CustomValueWriteOutcome = "retry";
  try {
    outcome = await deps.update(input.tenantId, candidate.target, candidate.previous);
  } catch {
    console.error("Settings save failed: step=restore");
  }
  written.restored = outcome === "saved";
  await closeAudit(auditId, outcome === "saved" ? "saved" : "failed", deps);
}

// The two colors must not end up half changed: a new main color with the old text can be unreadable.
async function writePair(input: Input, first: Candidate, second: Candidate, deps: SaveDeps, out: Results): Promise<Written[]> {
  const a = await writeAudited(input, first, deps);
  if (!a) {
    out.set(first.key, { key: first.key, status: "retry" });
    out.set(second.key, { key: second.key, status: "retry" });
    return [];
  }
  if (a.http !== "saved") {
    out.set(second.key, { key: second.key, status: "retry" });
    return [a];
  }
  const b = await writeAudited(input, second, deps);
  if (b?.http === "saved") return [a, b];
  if (!b) out.set(second.key, { key: second.key, status: "retry" });
  else {
    // An error answer can follow a write that applied. Only a read can tell.
    const fresh = await safeRead(input.tenantId, deps);
    if (!fresh.ok) return [a, b];
    if (valuesOf(fresh.values)[second.key] === second.value) return [a, b];
  }
  await restore(input, a, deps);
  return b ? [a, b] : [a];
}

async function safeRead(tenantId: string, deps: SaveDeps): Promise<CustomValueRead> {
  try {
    return await deps.read(tenantId);
  } catch {
    return { ok: false, reason: "retry" };
  }
}

// What HighLevel holds now decides the result, not the answer to the PUT.
function confirmed(written: Written, now: CustomValues | null): { status: SaveStatus; audit: AuditOutcome } {
  if (!now) return { status: "unknown", audit: "unknown" };
  const { candidate, http, restored } = written;
  const current = now[candidate.key];
  const previous = candidate.previous.trim();
  if (restored) return current === previous ? { status: "retry", audit: "reverted" } : { status: "unknown", audit: "unknown" };
  if (current === candidate.value) return { status: "saved", audit: "saved" };
  if (current !== previous || http === "saved") return { status: "unknown", audit: "unknown" };
  return { status: http, audit: http === "retry" ? "failed" : http };
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

async function runSave(input: Input, deps: SaveDeps): Promise<{ results: SaveResult[] }> {
  const { tenantId, changes } = input;
  const started = deps.now();
  const read = await safeRead(tenantId, deps);
  if (!read.ok) {
    const status = read.reason;
    return { results: changes.map(({ key }) => ({ key, status })) };
  }
  const byKey = new Map(read.values.map((row) => [row.key, row]));
  const current = valuesOf(read.values);
  const out: Results = new Map();
  const candidates: Candidate[] = [];
  for (const change of changes) {
    const { key } = change;
    const value = change.value.trim();
    // The allowlist comes first, so the answer never reveals whether a denied key exists.
    if (!isSettingsKeyAllowed(key)) out.set(key, { key, status: "denied" });
    else {
      const target = byKey.get(key);
      const now = target?.value.trim();
      if (!target || now === undefined) out.set(key, { key, status: "missing" });
      else if (!value || !isSafeToWrite(key, value)) out.set(key, { key, status: "invalid" });
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
  const units = toUnits(writable);
  const written: Written[] = [];
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
      if (unit.length === 2) return writePair(input, unit[0], unit[1], deps, out);
      const one = await writeAudited(input, unit[0], deps);
      if (!one) out.set(unit[0].key, { key: unit[0].key, status: "retry" });
      return one ? [one] : [];
    }));
    written.push(...done.flat());
  }
  if (written.length > 0) {
    const after = await safeRead(tenantId, deps);
    const now = after.ok ? valuesOf(after.values) : null;
    for (const item of written) {
      const { status, audit } = confirmed(item, now);
      out.set(item.candidate.key, { key: item.candidate.key, status });
      await closeAudit(item.auditId, audit, deps);
    }
    try {
      deps.invalidate(tenantId);
    } catch {
      console.error("Settings save failed: step=cache");
    }
  }
  return { results: changes.map(({ key }) => out.get(key) as SaveResult) };
}

// Saves the owner's changes to the tenant's sub-account. Never creates or deletes a custom value and
// never overwrites a value that changed in HighLevel after the owner loaded it.
export async function saveCustomValues(input: Input, deps: SaveDeps): Promise<{ results: SaveResult[] }> {
  let holder: string | null;
  try {
    holder = await deps.claim(input.tenantId);
  } catch {
    console.error("Settings save failed: step=lease");
    return { results: input.changes.map(({ key }) => ({ key, status: "retry" as const })) };
  }
  if (!holder) return { results: input.changes.map(({ key }) => ({ key, status: "busy" as const })) };
  try {
    return await runSave(input, deps);
  } finally {
    await deps.release(input.tenantId, holder).catch(() => console.error("Settings save failed: step=lease-release"));
  }
}
