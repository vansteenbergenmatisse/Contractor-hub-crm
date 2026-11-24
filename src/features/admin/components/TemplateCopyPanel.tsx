"use client";

import { useEffect, useRef, useState } from "react";
import type { CopyBatch, CopyKeyResult, CopyKeyStatus, CopyPreview } from "@/features/template-copy";

// "Copy values from template" for one client: first a preview (nothing written), then the copy in
// batches until the server says done. Plain styling like the rest of the clients table.
const MAX_CALLS = 40;

const ERRORS: Record<string, string> = {
  busy: "A Settings save for this client is running. Wait a minute and try again.",
  template_unreadable: "Could not read the template's values from HighLevel. Try again later.",
  target_unreadable: "Could not read this client's values from HighLevel. Check the connection and try again.",
  same_tenant: "This client is the template itself.",
  rate_limited: "Too many copy requests. Wait a while and try again.",
  viewing: "Leave View as client first.",
  not_found: "Copy from template is turned off.",
};
const failText = (code: string | undefined) => (code && ERRORS[code]) || "Could not copy from the template. Try again.";

const PROBLEMS: [CopyKeyStatus, string][] = [
  ["conflict", "Changed in HighLevel meanwhile, left alone"],
  ["needs_media_permission", "Needs media permission (left blank)"],
  ["image_host_not_allowed", "Image on a host we do not copy from (left blank)"],
  ["not_an_image", "Linked file is not an image (left blank)"],
  ["image_failed", "Image could not be copied (left blank)"],
  ["missing", "Missing in this client"],
  ["rejected", "Refused by HighLevel"],
  ["permission", "No permission to write"],
  ["failed", "Failed"],
  ["unknown", "Not confirmed, check in HighLevel"],
];

async function call(tenantId: string, body: unknown): Promise<{ ok: boolean; json: unknown }> {
  const response = await fetch(`/api/admin/clients/${encodeURIComponent(tenantId)}/copy-template`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, json: await response.json().catch(() => null) };
}

const errorOf = (json: unknown) => (typeof json === "object" && json !== null ? (json as { error?: string }).error : undefined);

export function TemplateCopyPanel({ tenantId, clientName, onClose }: { tenantId: string; clientName: string; onClose: () => void }) {
  const [preview, setPreview] = useState<CopyPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<CopyKeyResult[] | null>(null);
  const [finished, setFinished] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    let live = true;
    call(tenantId, { action: "preview" })
      .then(({ ok, json }) => {
        if (!live) return;
        if (ok) setPreview(json as CopyPreview);
        else setError(failText(errorOf(json)));
      })
      .catch(() => live && setError("Could not reach the server. Check your connection and try again."));
    return () => {
      live = false;
    };
  }, [tenantId]);

  async function copy() {
    if (!preview || started.current) return;
    started.current = true;
    setRunning(true);
    setError(null);
    const overwrite = Object.fromEntries(preview.different.filter((d) => ticked.has(d.key)).map((d) => [d.key, d.token]));
    const all: CopyKeyResult[] = [];
    const skip = new Set<string>();
    try {
      for (let round = 0; round < MAX_CALLS; round += 1) {
        const { ok, json } = await call(tenantId, { action: "apply", overwrite, skip: [...skip] });
        if (!ok) {
          setError(failText(errorOf(json)));
          break;
        }
        const batch = json as Extract<CopyBatch, { status: "ok" }>;
        for (const result of batch.results) {
          all.push(result);
          if (result.status !== "filled" && result.status !== "overwritten") skip.add(result.key);
        }
        setResults([...all]);
        if (batch.done) {
          setFinished(true);
          break;
        }
        // No progress in a batch means something keeps it from moving: stop instead of looping.
        if (batch.results.length === 0) {
          setError("The copy stopped making progress. Run the preview again to see what is left.");
          break;
        }
      }
    } catch {
      setError("Could not reach the server. The copy stopped; run it again to finish the rest.");
    } finally {
      setRunning(false);
    }
  }

  const count = (status: CopyKeyStatus) => results?.filter((r) => r.status === status).length ?? 0;
  const images = results?.filter((r) => r.image && (r.status === "filled" || r.status === "overwritten")).length ?? 0;
  const toWrite = (preview?.counts.fill ?? 0) + ticked.size;

  return (
    <section aria-label={`Copy values from template for ${clientName}`}>
      {!preview && !error ? <p role="status">Reading the template and this client. Nothing is written yet.</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {preview && !results ? (
        <div>
          <p>
            Preview for {clientName}. Nothing has been written yet. {preview.counts.fill} to fill (blank in this client), {preview.counts.same} already the same,{" "}
            {preview.counts.different} filled with a different value, {preview.counts.missing} this client does not have, {preview.counts.images} images.
          </p>
          {preview.counts.hidden > 0 ? <p>Values of {preview.counts.hidden} secret-looking keys are copied but not shown here.</p> : null}
          {preview.fill.length > 0 ? (
            <details>
              <summary>Keys to fill ({preview.fill.length})</summary>
              <ul>
                {preview.fill.map((f) => (
                  <li key={f.key}>
                    <code>{f.key}</code>
                    {f.image ? " (image, copied into this client's media library)" : ""}
                    {f.value !== undefined && !f.image ? `: ${f.value}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {preview.different.length > 0 ? (
            <fieldset>
              <legend>Already filled with a different value. Tick a key only to replace it with the template&apos;s value.</legend>
              {preview.different.map((d) => (
                <div key={d.key}>
                  <label>
                    <input
                      type="checkbox"
                      checked={ticked.has(d.key)}
                      disabled={running}
                      onChange={(event) =>
                        setTicked((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(d.key);
                          else next.delete(d.key);
                          return next;
                        })
                      }
                    />{" "}
                    Replace <code>{d.key}</code>
                    {d.targetValue !== undefined ? ` (now "${d.targetValue}", template "${d.templateValue}")` : " (value hidden)"}
                  </label>
                </div>
              ))}
            </fieldset>
          ) : null}
          {preview.missing.length > 0 ? (
            <p>
              Not in this client, so not copied (create them in HighLevel first): {preview.missing.map((k) => <code key={k}>{k} </code>)}
            </p>
          ) : null}
          {preview.duplicates.length > 0 ? <p>Listed twice in HighLevel, so not copied: {preview.duplicates.map((k) => <code key={k}>{k} </code>)}</p> : null}
          <p>
            <button type="button" onClick={copy} disabled={running || toWrite === 0}>
              {running ? "Copying..." : `Copy ${toWrite} values`}
            </button>{" "}
            <button type="button" onClick={onClose} disabled={running}>
              Cancel
            </button>
          </p>
        </div>
      ) : null}
      {results ? (
        <div>
          <p role="status">
            {finished ? "Done." : running ? "Copying..." : "Stopped."} Filled {count("filled")}, replaced {count("overwritten")}, already the same {count("unchanged")}, conflicts {count("conflict")}, failed{" "}
            {results.length - count("filled") - count("overwritten") - count("unchanged") - count("conflict")}, images copied {images}.
          </p>
          {PROBLEMS.map(([status, label]) => {
            const keys = results.filter((r) => r.status === status).map((r) => r.key);
            return keys.length > 0 ? (
              <p key={status}>
                {label}: {keys.map((k) => <code key={k}>{k} </code>)}
              </p>
            ) : null;
          })}
          {!running ? (
            <button type="button" onClick={onClose}>
              Close
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
