"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { imageFailureMessage, imageSavedMessage } from "../api/image-messages";
import type { ImageAnswer, ImageKind, ImageUploader, PrepareImage } from "../types";

// `file`: the owner's original, kept so it can be encoded again to the current file's format.
type Ready = { file: File; blob: Blob; previewUrl: string; summary: string };
type Props = {
  fieldKey: string;
  label: string;
  kind: ImageKind;
  // The saved link, sent so the server can refuse a value that changed meanwhile.
  current: string;
  // The owner typed a link that is not saved yet.
  dirty: boolean;
  upload: ImageUploader;
  prepare: PrepareImage;
  onValue: (key: string, value: string, saved: boolean) => void;
};

const ACCEPT: Record<ImageKind, string> = { svg: ".svg,image/svg+xml", photo: "image/*" };
const HINT: Record<ImageKind, string> = { svg: "SVG file, up to 512 KB.", photo: "Photo. We make it smaller for you." };

// One image field's Change image: pick or drop a file, see it, then save it. The result shows here,
// next to the field.
export function ImageChange({ fieldKey, label, kind, current, dirty, upload, prepare, onValue }: Props) {
  const short = label.replace(/\s*\(.*\)$/, "");
  const input = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [busy, setBusy] = useState<"preparing" | "saving" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneText, setDoneText] = useState<string | null>(null);
  const shown = useRef<string | null>(null);
  useEffect(() => () => {
    if (shown.current) URL.revokeObjectURL(shown.current);
  }, []);
  // The button that had focus leaves the screen at each step, so keyboard users are moved to the next one.
  const saveButton = useRef<HTMLButtonElement>(null);
  const changeButton = useRef<HTMLButtonElement>(null);
  const hadPreview = useRef(false);
  useEffect(() => {
    if (ready && !busy) saveButton.current?.focus();
    else if (!ready && !busy && hadPreview.current) changeButton.current?.focus();
    hadPreview.current = !!ready;
  }, [ready, busy]);

  function showReady(next: Ready | null) {
    if (shown.current) URL.revokeObjectURL(shown.current);
    shown.current = next?.previewUrl ?? null;
    setReady(next);
  }

  async function take(file: File | undefined) {
    if (!file || busy) return;
    setError(null);
    setDoneText(null);
    setBusy("preparing");
    try {
      const result = await prepare(file, kind);
      if (result.ok) showReady({ file, blob: result.blob, previewUrl: result.previewUrl, summary: result.summary });
      else setError(result.message);
    } catch {
      setError("This file could not be read. Try another one.");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  async function save() {
    if (!ready || busy) return;
    setError(null);
    setBusy("saving");
    let answer: ImageAnswer;
    try {
      answer = await upload({ key: fieldKey, expected: current, blob: ready.blob });
      // The server read the current file's real format before any write: encode to it, once.
      if (answer.status === "format_mismatch" && kind === "photo" && answer.format && answer.format !== "svg") {
        const again = await prepare(ready.file, kind, answer.format);
        if (again.ok) {
          showReady({ file: ready.file, blob: again.blob, previewUrl: again.previewUrl, summary: again.summary });
          answer = await upload({ key: fieldKey, expected: current, blob: again.blob });
        }
      }
    } catch {
      answer = { status: "failed" };
    }
    setBusy(null);
    if (answer.status === "saved" && answer.url) {
      onValue(fieldKey, answer.url, true);
      showReady(null);
      setDoneText(imageSavedMessage(answer));
      return;
    }
    if (answer.status === "conflict" && answer.current !== undefined) onValue(fieldKey, answer.current, false);
    setError(imageFailureMessage(answer));
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    if (!dirty) void take(event.dataTransfer.files?.[0]);
  }

  return (
    <div className="fd-imgc" role="group" aria-label={`Change ${short}`} onDragOver={(event) => event.preventDefault()} onDrop={drop}>
      <input ref={input} type="file" hidden accept={ACCEPT[kind]} aria-label={`Choose a file for ${short}`} onChange={(event) => void take(event.target.files?.[0])} />
      {dirty ? (
        <p className="fd-hint fd-cvh">Save or undo your link change before changing the image.</p>
      ) : ready ? (
        <>
          <span className="fd-cvp" role="img" aria-label={`New ${short} preview`} style={{ backgroundImage: `url("${ready.previewUrl}")` }} />
          <p className="fd-hint fd-cvh">{ready.summary}</p>
          {busy === "saving" ? null : (
            <div className="fd-imga">
              <button ref={saveButton} type="button" className="fd-btn is-fill" onClick={() => void save()}>Save image</button>
              <button type="button" className="fd-btn is-plain" onClick={() => { showReady(null); setError(null); }}>Cancel</button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="fd-imga">
            <button ref={changeButton} type="button" className="fd-btn is-plain" disabled={busy !== null} onClick={() => input.current?.click()}>Change image</button>
          </div>
          <p className="fd-hint fd-cvh">{HINT[kind]} You can also drop a file here.</p>
        </>
      )}
      {busy ? <p className="fd-hint fd-cvh" role="status">{busy === "preparing" ? "Preparing image…" : "Uploading and saving…"}</p> : null}
      {doneText ? <p className="fd-okl" role="status"><span>{doneText}</span></p> : null}
      {error ? <p className="fd-lerr" role="alert">{error}</p> : null}
    </div>
  );
}
