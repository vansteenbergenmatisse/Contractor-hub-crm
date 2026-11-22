import { useEffect, useRef, type KeyboardEvent } from "react";
import type { CalendarViewModel } from "../api/view";

// "New estimate" or "New job": a name and one of up to three free times. A bottom sheet on a phone
// (the CSS does that). The name field gets the cursor when the sheet opens and when it has an error.
export function AddSheet({ add, name, onName, onPick, onClose }: {
  add: CalendarViewModel["add"];
  name: string;
  onName: (value: string) => void;
  onPick: (index: number) => void;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (add.open || add.error) input.current?.focus();
  }, [add.open, add.error]);
  // Escape closes the sheet like Cancel.
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && add.open) {
      e.preventDefault();
      onClose();
    }
  };
  return (
    <>
      <button type="button" className={`fx-addscrim${add.open ? " is-on" : ""}`} aria-label="Close" tabIndex={add.open ? 0 : -1} onClick={onClose} />
      <div className={`fd-cnew${add.open ? "" : " is-off"}`} onKeyDown={onKey}>
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
