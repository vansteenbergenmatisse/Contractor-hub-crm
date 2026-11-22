"use client";

import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useDialog } from "@/features/app-shell";
import { stageOptions } from "../api/stage-move";

// The sheet that moves a card to a stage the owner chooses. It is not in the design: it uses the
// classes of the design's reason sheet, so it looks and behaves like it (focus stays inside, Escape
// is Cancel, focus goes back on close, and on a phone it is a bottom sheet that scrolls). Stages only
// a send can reach are drawn disabled with the button to use instead.
export function StagePicker({ name, stage, onPick, onClose }: { name: string; stage: number; onPick: (to: number) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const title = useId();
  useDialog(box, onClose);
  const enabled = () => Array.from(list.current?.querySelectorAll<HTMLButtonElement>("button[data-stage]:not(:disabled)") ?? []);
  useEffect(() => {
    const id = setTimeout(() => enabled()[0]?.focus(), 80);
    return () => clearTimeout(id);
  }, []);
  // ⌘Z / Ctrl Z must not undo a move behind the open sheet. The shell skips a key already handled.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") event.preventDefault();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  const onArrows = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = enabled();
    const n = items.length;
    if (!n) return;
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    let to = -1;
    if (event.key === "ArrowDown") to = at < 0 ? 0 : (at + 1) % n;
    else if (event.key === "ArrowUp") to = at < 0 ? n - 1 : (at + n - 1) % n;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = n - 1;
    if (to < 0) return;
    event.preventDefault();
    items[to].focus();
  };
  const sheet = (
    <div ref={box} className="fd-cf fd-dg" role="dialog" aria-modal="true" aria-labelledby={title}>
      <div className="fd-cfb">
        <h3 className="fd-cft" id={title}>{`Move ${name} to`}</h3>
        <p className="fd-cfp">Pick a stage.</p>
        <div ref={list} className="fd-cfa" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }} onKeyDown={onArrows}>
          {stageOptions(stage).map((st) => (
            <button
              key={st.index}
              type="button"
              data-stage={st.index}
              className="fd-btn is-plain"
              disabled={!!st.blocked}
              style={st.blocked ? { flexDirection: "column", gap: 0, whiteSpace: "normal" } : undefined}
              onClick={() => onPick(st.index)}
            >
              {st.name}
              {st.blocked ? <span style={{ fontSize: "0.8125rem", fontWeight: 400 }}> {st.blocked}</span> : null}
            </button>
          ))}
          <button type="button" className="fd-btn is-plain" style={{ gridColumn: "1 / -1" }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
  // Inside the app frame, where the shell's own sheets sit, so the sheet covers the whole screen.
  return createPortal(sheet, document.querySelector(".fd-app") ?? document.body);
}
