import type { CalendarViewModel } from "../api/view";

// Delete asks first. The safe choice, Reschedule, is the filled button; Delete is red. A small local
// dialog (the shell has no confirm dialog yet).
export function ConfirmDelete({ confirm, onReschedule, onYes, onNo }: {
  confirm: CalendarViewModel["confirm"];
  onReschedule: () => void;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className={`fd-cf${confirm.open ? "" : " is-off"}`} role="alertdialog" aria-modal="true" aria-labelledby="fd-cf-t" aria-hidden={!confirm.open}>
      <div className="fd-cfb">
        <h3 className="fd-cft" id="fd-cf-t">{confirm.title}</h3>
        <p className="fd-cfp">{confirm.body}</p>
        <div className="fd-cfa">
          <button type="button" className={`fd-btn is-fill${confirm.canReschedule ? "" : " is-off"}`} onClick={onReschedule}>Reschedule instead</button>
          <button type="button" className="fd-btn is-danger" onClick={onYes}>{confirm.yesText}</button>
          <button type="button" className="fd-btn is-plain" onClick={onNo}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
