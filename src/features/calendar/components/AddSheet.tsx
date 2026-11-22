"use client";

import { useEffect, useRef } from "react";
import { trapFocus } from "@/features/app-shell";
import type { CalendarViewModel } from "../api/view";

// "New estimate" or "New job": a name and one of up to three free times. A bottom sheet on a phone
// (the CSS does that). The name field gets the cursor when the sheet opens and when it has an error.
// While open (on the whole document, wherever focus is): Escape closes it like Cancel and Tab stays
// inside it. On close the cursor goes back to the button that opened it.
export function AddSheet({ add, name, onName, onPick, onClose }: {
  add: CalendarViewModel["add"];
  name: string;
  onName: (value: string) => void;
  onPick: (index: number) => void;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);

  // Remember the opener before the name field takes the cursor; give it back when the sheet closes.
  useEffect(() => {
    if (add.open && !wasOpen.current) {
      const at = document.activeElement;
      opener.current = at instanceof HTMLElement && at !== document.body && !box.current?.contains(at) ? at : null;
    } else if (!add.open && wasOpen.current) {
      const back = opener.current;
      opener.current = null;
      if (back && back.isConnected) {
        back.focus();
        // The phone action bar shows again one shell render later; a browser does not focus a hidden
        // button, so try once more after that render.
        if (document.activeElement !== back) setTimeout(() => { if (back.isConnected && document.activeElement === document.body) back.focus(); }, 0);
      }
    }
    wasOpen.current = add.open;
  }, [add.open]);
  useEffect(() => {
    if (add.open || add.error) input.current?.focus();
  }, [add.open, add.error]);

  useEffect(() => {
    if (!add.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (e.defaultPrevented) return;
        e.preventDefault();
        onClose();
        return;
      }
      trapFocus(e, box.current);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [add.open, onClose]);
  return (
    <>
      <button type="button" className={`fx-addscrim${add.open ? " is-on" : ""}`} aria-label="Close" tabIndex={add.open ? 0 : -1} onClick={onClose} />
      <div ref={box} className={`fd-cnew${add.open ? "" : " is-off"}`}>
        <h3 className="fd-pnh">{add.title}</h3>
        <label className="fd-ll" htmlFor="fd-ca-name">Customer name</label>
        <input ref={input} className="fd-lin" id="fd-ca-name" type="text" autoComplete="off" value={name} aria-invalid={add.error ? true : undefined} aria-describedby={add.error ? "fd-ca-err" : undefined} onChange={(e) => onName(e.target.value)} />
        <p className={`fd-lerr${add.error ? "" : " is-off"}`} id="fd-ca-err" role="alert"><span>{add.error}</span></p>
        <p className="fd-pns">Pick a free time:</p>
        <div className="fd-rac fd-pna">
          {add.options.length ? add.options.map((o, k) => (
            <button key={k} type="button" className="fd-btn" onClick={() => onPick(k)}>{o.text}</button>
          )) : <p>No free time in the next two weeks.</p>}
          <button type="button" className="fd-btn is-plain" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </>
  );
}
