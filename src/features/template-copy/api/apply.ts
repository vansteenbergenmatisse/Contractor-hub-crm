import type { CustomValueDetail, CustomValueRead, CustomValueWriteOutcome } from "@/features/highlevel";
import type { AuditOutcome, AuditStart } from "@/features/settings-write-back";
import type { CopyBatch, CopyKeyResult, CopyKeyStatus, CopyPreview, ImageCopyOutcome, PlanEntry, PreviewAnswer } from "../types";
import { planCopy, toPreview } from "./plan";

// Keys whose writes are checked by one fresh read: the read right before each group is also the
// confirming read of the group before it.
const GROUP = 4;
// One call starts no new key after this long or this many writes; the admin's page calls again
// until `done`. The route's maxDuration is 60 seconds, so every later step has its own cut-off:
// an image starts only before IMAGE_START_MS and is given up at IMAGE_DEADLINE_MS (the first image
// also walks both media libraries); its write starts only before WRITE_CUTOFF_MS; the confirming read
// at the end runs only before SETTLE_CUTOFF_MS (else the writes are reported "unknown"). Each HighLevel
// request has its own 10 s timeout, so the worst case stays near 60 s.
export const BATCH_BUDGET_MS = 30_000;
export const IMAGE_START_MS = 20_000;
export const IMAGE_DEADLINE_MS = 35_000;
export const WRITE_CUTOFF_MS = 42_000;
export const SETTLE_CUTOFF_MS = 48_000;
export const MAX_WRITES_PER_BATCH = 60;
export const MAX_IMAGES_PER_BATCH = 6;
const HIDDEN = "[hidden: secret-looking key]";

export type CopyDeps = {
  readTemplate: () => Promise<CustomValueRead>;
  readTarget: () => Promise<CustomValueRead>;
  update: (target: CustomValueDetail, value: string) => Promise<CustomValueWriteOutcome>;
  begin: (row: AuditStart) => Promise<string>;
  finish: (id: string, outcome: AuditOutcome) => Promise<void>;
  // The Settings save lease of the target, so an owner's save and a copy never interleave.
  claim: () => Promise<string | null>;
  release: (holder: string) => Promise<void>;
  invalidate: () => void;
  copyImage: (url: string) => Promise<ImageCopyOutcome>;
  tokenOf: (key: string, value: string) => string;
  // Keyed digest of the template's values (templateDigest). Left out, drift is not checked.
  digestOf?: (rows: readonly { key: string; value: string }[]) => string;
  isImage: (value: string) => boolean;
  isSecret: (key: string) => boolean;
  // True when the target location answered 429 since the last call; a refused write is sent once more.
  wasLimited?: () => boolean;
  now: () => number;
  // Real timer for the image deadline; a test passes one that resolves at once.
  wait?: (ms: number) => Promise<void>;
};

export type ApplyInput = {
  targetTenantId: string;
  actorId: string;
  // Filled keys the admin ticked, each with the token of the value the preview showed.
  overwrite: Readonly<Record<string, string>>;
  // Keys this run already reported (conflict, failure), so a later batch does not try them again.
  skip: ReadonlySet<string>;
  // The preview's templateDigest. When given, a template that changed since then writes nothing.
  templateDigest?: string;
};

type Written = { key: string; value: string; kind: "filled" | "overwritten"; http: CustomValueWriteOutcome; auditId: string; image?: "reused" | "uploaded" };

function log(step: string, fields: Record<string, string | number> = {}) {
  console.info(JSON.stringify({ templateCopy: step, ...fields }));
}

async function safeRead(read: () => Promise<CustomValueRead>): Promise<CustomValueRead> {
  try {
    return await read();
  } catch {
    return { ok: false, reason: "retry" };
  }
}

// The audit keeps the value of a key that is not secret-looking, so the change can be undone; a
// secret-looking value is not copied into another table.
const auditValue = (deps: CopyDeps, key: string, value: string) => (value === "" ? "" : deps.isSecret(key) ? HIDDEN : value);

export async function previewTemplateCopy(deps: Pick<CopyDeps, "readTemplate" | "readTarget" | "tokenOf" | "digestOf" | "isImage" | "isSecret">): Promise<PreviewAnswer> {
  const template = await safeRead(deps.readTemplate);
  if (!template.ok) return { status: "template_unreadable" };
  const target = await safeRead(deps.readTarget);
  if (!target.ok) return { status: "target_unreadable" };
  const plan = planCopy(template.values, target.values, { targetDuplicates: target.duplicates?.map((d) => d.key), isImage: deps.isImage, isSecret: deps.isSecret });
  const preview: CopyPreview = toPreview(plan, deps.tokenOf, template.duplicates?.map((d) => d.key));
  if (deps.digestOf) preview.templateDigest = deps.digestOf(template.values);
  // business_name is on the Settings allowlist, so it is not a secret-looking value.
  const name = template.values.find((r) => r.key === "business_name")?.value.trim();
  if (name && !deps.isSecret("business_name")) preview.templateName = name.slice(0, 120);
  log("preview", { templateKeys: preview.counts.templateKeys, fill: preview.counts.fill, same: preview.counts.same, different: preview.counts.different, missing: preview.counts.missing, images: preview.counts.images });
  return { status: "ok", preview };
}

// The work of this run: blank target keys, and filled ones only when ticked.
function workOf(plan: readonly PlanEntry[], input: ApplyInput): PlanEntry[] {
  return plan.filter((e) => !input.skip.has(e.key) && (e.state === "fill" || (e.state === "different" && Object.hasOwn(input.overwrite, e.key))));
}

// Still what the preview promised: blank for a fill, the same token for a ticked overwrite.
function expectation(entry: PlanEntry, row: CustomValueDetail | undefined, input: ApplyInput, deps: CopyDeps): CopyKeyStatus | null {
  if (!row) return "missing";
  const now = row.value.trim();
  if (now === entry.template) return "unchanged";
  if (entry.state === "fill") return now === "" ? null : "conflict";
  return deps.tokenOf(entry.key, now) === input.overwrite[entry.key] ? null : "conflict";
}

function settledStatus(item: Written, seen: Map<string, string> | null): { status: CopyKeyStatus; audit: AuditOutcome } {
  const now = seen?.get(item.key);
  if (now !== undefined && now === item.value) return { status: item.kind, audit: "saved" };
  if (item.http === "saved" || item.http === "no_answer" || !seen) return { status: "unknown", audit: "unknown" };
  if (item.http === "retry") return { status: "failed", audit: "failed" };
  return { status: item.http, audit: item.http };
}

export async function applyTemplateCopy(input: ApplyInput, deps: CopyDeps): Promise<CopyBatch> {
  let holder: string | null;
  try {
    holder = await deps.claim();
  } catch {
    holder = null;
  }
  if (!holder) return { status: "busy" };
  try {
    return await runBatch(input, deps);
  } finally {
    await deps.release(holder).catch(() => console.error("Template copy failed: step=release"));
  }
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));

// The image copy, given up after `ms`. A copy still running in the background may finish its upload;
// the next run then finds that file by name and reuses it.
async function imageWithin(deps: CopyDeps, url: string, ms: number): Promise<ImageCopyOutcome> {
  if (ms <= 0) return { kind: "image_failed" };
  const late = (deps.wait ?? wait)(ms).then((): ImageCopyOutcome => ({ kind: "image_failed" }));
  return Promise.race([deps.copyImage(url).catch((): ImageCopyOutcome => ({ kind: "image_failed" })), late]);
}

async function runBatch(input: ApplyInput, deps: CopyDeps): Promise<CopyBatch> {
  const started = deps.now();
  const elapsed = () => deps.now() - started;
  const template = await safeRead(deps.readTemplate);
  if (!template.ok) return { status: "template_unreadable" };
  if (input.templateDigest !== undefined && deps.digestOf && deps.digestOf(template.values) !== input.templateDigest) {
    log("template_changed", { tenant: input.targetTenantId });
    return { status: "template_changed" };
  }
  const first = await safeRead(deps.readTarget);
  if (!first.ok) return { status: "target_unreadable" };
  const plan = planCopy(template.values, first.values, { targetDuplicates: first.duplicates?.map((d) => d.key), isImage: deps.isImage, isSecret: deps.isSecret });
  const work = workOf(plan, input);
  const results: CopyKeyResult[] = [];
  const done = new Set<string>();
  let pending: Written[] = [];
  let rows: CustomValueDetail[] = first.values;
  let writes = 0;
  let images = 0;

  const settle = (seen: CustomValueDetail[] | null) => {
    const map = seen ? new Map(seen.map((r) => [r.key, r.value.trim()])) : null;
    const closing = pending.map(async (item) => {
      const { status, audit } = settledStatus(item, map);
      results.push(item.image ? { key: item.key, status, image: item.image } : { key: item.key, status });
      await deps.finish(item.auditId, audit).catch(() => console.error("Template copy failed: step=audit-finish"));
    });
    pending = [];
    return Promise.all(closing);
  };

  const outOfTime = () => elapsed() > BATCH_BUDGET_MS || writes >= MAX_WRITES_PER_BATCH;
  groups: for (let at = 0; at < work.length; at += GROUP) {
    if (outOfTime()) break;
    if (at > 0) {
      const fresh = await safeRead(deps.readTarget);
      if (!fresh.ok) break;
      rows = fresh.values;
      await settle(rows);
    }
    for (const entry of work.slice(at, at + GROUP)) {
      if (outOfTime()) break groups;
      if (entry.image && (images >= MAX_IMAGES_PER_BATCH || elapsed() > IMAGE_START_MS)) continue;
      // A filled secret-looking key is never replaced: the admin cannot see either value and the
      // audit cannot keep the old one, so the client's own credential would be lost for good.
      if (entry.state === "different" && entry.secret) {
        done.add(entry.key);
        results.push({ key: entry.key, status: "secret_not_replaced" });
        continue;
      }
      let byKey = new Map(rows.map((r) => [r.key, r]));
      const stop = expectation(entry, byKey.get(entry.key), input, deps);
      if (stop) {
        done.add(entry.key);
        results.push({ key: entry.key, status: stop });
        continue;
      }
      let value = entry.template;
      let image: "reused" | "uploaded" | undefined;
      if (entry.image) {
        images += 1;
        const copied = await imageWithin(deps, entry.template, IMAGE_DEADLINE_MS - elapsed());
        if (copied.kind !== "reused" && copied.kind !== "uploaded") {
          done.add(entry.key);
          results.push({ key: entry.key, status: copied.kind });
          continue;
        }
        value = copied.url;
        image = copied.kind;
        // Too late to write safely in this call: the next call finds the copied file and reuses it.
        if (elapsed() > WRITE_CUTOFF_MS) break groups;
        // The image took time: check the key again right before writing.
        const fresh = await safeRead(deps.readTarget);
        if (!fresh.ok) {
          done.add(entry.key);
          results.push({ key: entry.key, status: "failed", image });
          continue;
        }
        rows = fresh.values;
        byKey = new Map(rows.map((r) => [r.key, r]));
        const again = expectation(entry, byKey.get(entry.key), input, deps);
        if (again) {
          done.add(entry.key);
          results.push({ key: entry.key, status: again, image });
          continue;
        }
      }
      const row = byKey.get(entry.key) as CustomValueDetail;
      done.add(entry.key);
      let auditId: string;
      try {
        auditId = await deps.begin({
          tenantId: input.targetTenantId,
          actorId: input.actorId,
          key: entry.key,
          previousValue: auditValue(deps, entry.key, row.value.trim()),
          newValue: auditValue(deps, entry.key, value),
        });
      } catch {
        console.error("Template copy failed: step=audit-start");
        results.push({ key: entry.key, status: "failed" });
        continue;
      }
      writes += 1;
      let http: CustomValueWriteOutcome = "no_answer";
      try {
        // Reset the 429 counter, so only a 429 on this very update counts below.
        deps.wasLimited?.();
        http = await deps.update(row, value);
        // HighLevel refused it under its burst limit: the pacer has waited, so send it once more.
        if (http === "retry" && deps.wasLimited?.()) http = await deps.update(row, value);
      } catch {
        console.error("Template copy failed: step=update");
      }
      pending.push({ key: entry.key, value, kind: entry.state === "fill" ? "filled" : "overwritten", http, auditId, image });
    }
  }
  if (pending.length > 0) {
    const fresh = elapsed() > SETTLE_CUTOFF_MS ? null : await safeRead(deps.readTarget);
    await settle(fresh?.ok ? fresh.values : null);
  }
  if (writes > 0) deps.invalidate();
  const remaining = work.filter((e) => !done.has(e.key)).length;
  const count = (status: CopyKeyStatus) => results.filter((r) => r.status === status).length;
  log("batch", {
    tenant: input.targetTenantId,
    writes,
    filled: count("filled"),
    overwritten: count("overwritten"),
    conflicts: count("conflict"),
    failed: results.length - count("filled") - count("overwritten") - count("unchanged") - count("conflict"),
    remaining,
  });
  return { status: "ok", results, remaining, done: remaining === 0 };
}
