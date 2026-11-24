"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { LOGO_ACCEPTS_PHOTO } from "../api/image-keys";
import { imageFailureMessage, imageSavedMessage } from "../api/image-messages";
import type { ImageAnswer, ImageKind, ImageUploader, PrepareImage } from "../types";

// `file`: the owner's original, kept so it can be encoded again to the current file's format.
// `as`: how it was prepared ("svg" is kept as is; "photo" was compressed).
type Ready = { file: File; as: ImageKind; blob: Blob; previewUrl: string; summary: string };
type Props = {
  fieldKey: string;
  label: string;
  kind: ImageKind;
  // The saved link, sent so the server can refuse a value that changed meanwhile. "" for an empty value.
  current: string;
  // The owner typed a link that is not saved yet.
  dirty: boolean;
  upload: ImageUploader;
  prepare: PrepareImage;
  onValue: (key: string, value: string, saved: boolean) => void;
  // Remove: empties the field as a normal edit, so the step's save (with its confirm-clear step)
  // clears the value. The media file is never removed.
  onClear?: (key: string) => void;
  // The logo and favicon take a photo too (compressed), besides an SVG.
  allowPhoto?: boolean;
  // The protected folder this field is in, sent with the upload.
  unlock?: string;
};

const ACCEPT: Record<ImageKind, string> = { svg: ".svg,image/svg+xml", photo: "image/*" };
const HINT: Record<ImageKind, string> = { svg: "SVG file, up to 512 KB.", photo: "Photo. We make it smaller for you." };
const SVG_OR_PHOTO_ACCEPT = ".svg,image/svg+xml,image/*";
const SVG_OR_PHOTO_HINT = "SVG file up to 512 KB, or a photo. We make photos smaller for you.";

const isSvgFile = (file: File) => file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");

// One image field's picker: pick or drop a file, see it, then save it; or remove the image. The
// result shows here, next to the field. An empty value gets the picker too.
export function ImageChange({ fieldKey, label, kind, current, dirty, upload, prepare, onValue, onClear, allowPhoto = LOGO_ACCEPTS_PHOTO, unlock }: Props) {
  const short = label.replace(/\s*\(.*\)$/, "");
  const svgOrPhoto = kind === "svg" && allowPhoto;
  const empty = current.trim() === "";
  const input = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [busy, setBusy] = useState<"preparing" | "saving" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneText, setDoneText] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const shown = useRef<string | null>(null);
  useEffect(() => () => {
    if (shown.current) URL.revokeObjectURL(shown.current);
  }, []);
  // A remove that was saved or undone is over (adjusted while rendering, not in an effect).
  if (removing && !dirty) setRemoving(false);
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
    const as: ImageKind = svgOrPhoto && !isSvgFile(file) ? "photo" : kind;
    try {
      const result = await prepare(file, as);
      if (result.ok) showReady({ file, as, blob: result.blob, previewUrl: result.previewUrl, summary: result.summary });
      else setError(result.message);
    } catch {
      setError("This file could not be read. Try another one.");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  const send = (blob: Blob) => upload({ key: fieldKey, expected: current, blob, ...(unlock ? { unlock } : {}) });

  async function save() {
    if (!ready || busy) return;
    setError(null);
    setBusy("saving");
    let answer: ImageAnswer;
    try {
      answer = await send(ready.blob);
      // The server read the current file's real format before any write: encode to it, once.
      if (answer.status === "format_mismatch" && ready.as === "photo" && answer.format && answer.format !== "svg") {
        const again = await prepare(ready.file, "photo", answer.format);
        if (again.ok) {
          showReady({ file: ready.file, as: "photo", blob: again.blob, previewUrl: again.previewUrl, summary: again.summary });
          answer = await send(again.blob);
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

  function remove() {
    if (!onClear || busy) return;
    setError(null);
    setDoneText(null);
    setRemoving(true);
    onClear(fieldKey);
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    if (!dirty) void take(event.dataTransfer.files?.[0]);
  }

  return (
    <div className="fd-imgc" role="group" aria-label={`Change ${short}`} onDragOver={(event) => event.preventDefault()} onDrop={drop}>
      <input ref={input} type="file" hidden accept={svgOrPhoto ? SVG_OR_PHOTO_ACCEPT : ACCEPT[kind]} aria-label={`Choose a file for ${short}`} onChange={(event) => void take(event.target.files?.[0])} />
      {dirty ? (
        <p className="fd-hint fd-cvh">{removing ? "Save this step to remove the image, or undo. The file stays in your media library." : "Save or undo your link change before changing the image."}</p>
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
            <button ref={changeButton} type="button" className="fd-btn is-plain" disabled={busy !== null} onClick={() => input.current?.click()}>{empty ? "Add image" : "Change image"}</button>
            {!empty && onClear ? <button type="button" className="fd-btn is-plain" disabled={busy !== null} onClick={remove}>Remove image</button> : null}
          </div>
          <p className="fd-hint fd-cvh">{svgOrPhoto ? SVG_OR_PHOTO_HINT : HINT[kind]} You can also drop a file here.</p>
        </>
      )}
      {busy ? <p className="fd-hint fd-cvh" role="status">{busy === "preparing" ? "Preparing image…" : "Uploading and saving…"}</p> : null}
      {doneText ? <p className="fd-okl" role="status"><span>{doneText}</span></p> : null}
      {error ? <p className="fd-lerr" role="alert">{error}</p> : null}
    </div>
  );
}
