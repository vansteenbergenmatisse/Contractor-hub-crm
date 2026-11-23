import type { CustomValueDetail, CustomValueRead, CustomValueWriteOutcome } from "@/features/highlevel";
import { safeHttpsUrl } from "@/shared/lib/safe-https-url";
import { LINK_KEYS, isSettingsKeyAllowed, validateValues, type CustomValues, type SaveResult, type ValueChange } from "@/features/settings";

const WRITES_AT_ONCE = 3;

export type AuditStart = { tenantId: string; actorId: string; key: string; previousValue: string; newValue: string };

export type SaveDeps = {
  read: (tenantId: string) => Promise<CustomValueRead>;
  update: (tenantId: string, target: CustomValueDetail, value: string) => Promise<CustomValueWriteOutcome>;
  begin: (row: AuditStart) => Promise<string>;
  finish: (id: string, outcome: CustomValueWriteOutcome) => Promise<void>;
  invalidate: (tenantId: string) => void;
};

type Candidate = { change: ValueChange; value: string; target: CustomValueDetail };

// Stricter than the form, because these values leave the app and feed the client's website and
// messages: every link must be https, and no value may carry markup or control characters.
const EXTRA_LINK_KEYS = [
  "business_website_url", "request_a_job_booking_link", "request_a_quote_booking_link",
  "business_google_profile_url", "google_review_request_url", "bbb_review_request_url",
];
const isLinkKey = (key: string) => EXTRA_LINK_KEYS.includes(key) || LINK_KEYS.includes(key);
const UNSAFE_TEXT = /[<>\u0000-\u001f\u007f]/;
const isSafeToWrite = (key: string, value: string) =>
  !UNSAFE_TEXT.test(value) && (!isLinkKey(key) || (/^https:\/\/\S+$/i.test(value) && safeHttpsUrl(value) !== null));

// The form's rules against HighLevel's current values. A bad value is taken out and the rest checked
// again. The contrast rule names main_color but judges a pair, so both sides of the pair are refused.
function refusedByValidation(candidates: readonly Candidate[], current: CustomValues): Set<string> {
  const next: CustomValues = { ...current };
  for (const { change, value } of candidates) next[change.key] = value;
  const refused = new Set<string>();
  const submitted = new Set(candidates.map((c) => c.change.key));
  for (let i = 0; i <= candidates.length; i += 1) {
    const problem = validateValues(next, current);
    if (!problem) return refused;
    const keys = problem.key === "main_color" ? ["main_color", "text_on_main_color"] : [problem.key];
    for (const key of keys) {
      if (submitted.has(key)) refused.add(key);
      next[key] = current[key] ?? "";
    }
  }
  // The rules still object after every value was taken out: write nothing.
  return submitted;
}

async function writeOne(input: { tenantId: string; actorId: string }, candidate: Candidate, deps: SaveDeps): Promise<CustomValueWriteOutcome> {
  let auditId: string;
  try {
    // No audit row, no write: every change in a client's account must be traceable and undoable.
    auditId = await deps.begin({
      tenantId: input.tenantId, actorId: input.actorId, key: candidate.change.key,
      previousValue: candidate.target.value, newValue: candidate.value,
    });
  } catch {
    console.error("Settings save failed: step=audit-start");
    return "retry";
  }
  let outcome: CustomValueWriteOutcome;
  try {
    outcome = await deps.update(input.tenantId, candidate.target, candidate.value);
  } catch {
    console.error("Settings save failed: step=update");
    outcome = "retry";
  }
  try {
    await deps.finish(auditId, outcome);
  } catch {
    console.error("Settings save failed: step=audit-finish");
  }
  return outcome;
}

// Saves the owner's changes to the tenant's sub-account. Never creates or deletes a custom value and
// never overwrites a value that changed in HighLevel after the owner loaded it.
export async function saveCustomValues(
  input: { tenantId: string; actorId: string; changes: readonly ValueChange[] },
  deps: SaveDeps,
): Promise<{ results: SaveResult[] }> {
  const { tenantId, changes } = input;
  let read: CustomValueRead;
  try {
    read = await deps.read(tenantId);
  } catch {
    read = { ok: false, reason: "retry" };
  }
  if (!read.ok) {
    const status = read.reason;
    return { results: changes.map(({ key }) => ({ key, status })) };
  }
  const byKey = new Map(read.values.map((row) => [row.key, row]));
  const current: CustomValues = Object.fromEntries(read.values.map((row) => [row.key, row.value.trim()]));
  const out = new Map<string, SaveResult>();
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
      else candidates.push({ change, value, target });
    }
  }
  const refused = refusedByValidation(candidates, current);
  const writable = candidates.filter((c) => {
    if (!refused.has(c.change.key)) return true;
    out.set(c.change.key, { key: c.change.key, status: "invalid" });
    return false;
  });
  for (let i = 0; i < writable.length; i += WRITES_AT_ONCE) {
    const batch = writable.slice(i, i + WRITES_AT_ONCE);
    const outcomes = await Promise.all(batch.map((candidate) => writeOne(input, candidate, deps)));
    batch.forEach((candidate, n) => out.set(candidate.change.key, { key: candidate.change.key, status: outcomes[n] }));
  }
  const results = changes.map(({ key }) => out.get(key) as SaveResult);
  if (results.some((result) => result.status === "saved")) {
    try {
      deps.invalidate(tenantId);
    } catch {
      console.error("Settings save failed: step=cache");
    }
  }
  return { results };
}
