import { Icon } from "@/features/app-shell";
import type { DetailView } from "../api/view";
import { Glyph } from "./Glyph";

// The panel for the stop you pressed: where, when, reminder status, and the buttons. Directions,
// Call and Text are not wired: they need the phone itself (not available in Phase 2).
export function StopDetail({ detail, deleteLabel, onClose, onReschedule, onCancelReschedule, onPickSlot, onUndoMove, onDelete }: {
  detail: DetailView;
  deleteLabel: string;
  onClose: () => void;
  onReschedule: () => void;
  onCancelReschedule: () => void;
  onPickSlot: (index: number) => void;
  onUndoMove: () => void;
  onDelete: () => void;
}) {
  return (
    <aside className={detail.cls} aria-label="The stop you pressed" aria-live="polite">
      <div className="fd-dh">
        <span className={detail.kindCls}>{detail.kind}</span>
        <button type="button" className="fd-ibtn fd-dx" aria-label="Close" onClick={onClose}><Icon name="close" size={18} strokeWidth={2} /></button>
      </div>
      <h3 className="fd-dn">{detail.name}</h3>
      <p className="fd-ds">{detail.service}</p>
      <p className="fd-dl fd-dl2"><Glyph name="clock" /><span>{detail.when}</span></p>
      <p className="fd-dl fd-dl2"><Glyph name="pin" /><span>{detail.address}</span></p>
      <p className="fd-dl"><Glyph name="bolt" /><span>{detail.status}</span></p>
      <p className={detail.moveCls}><Glyph name="check" strokeWidth={2.2} /><span>{detail.moveText}</span><button type="button" className="fd-link fd-dun" onClick={onUndoMove}>Undo</button></p>
      <div className="fd-da">
        <button data-fx-noact="1" type="button" className="fd-btn is-plain"><Glyph name="send" />Directions</button>
        <button data-fx-noact="1" type="button" className="fd-btn is-plain"><Icon name="call" size={15} strokeWidth={2} />Call</button>
        <button data-fx-noact="1" type="button" className="fd-btn is-plain"><Icon name="feedback" size={15} strokeWidth={2} />Text</button>
      </div>
      <button type="button" className={detail.rescheduleCls} onClick={onReschedule}><Glyph name="swap" />Reschedule</button>
      <button type="button" className="fd-btn is-danger fd-ddel" onClick={onDelete}><Glyph name="trash" /><span>{deleteLabel}</span></button>
      <div className={detail.pickCls}>
        <p className="fd-pkh">Pick a new time. {detail.first} gets a text with the change.</p>
        {detail.options.map((o, k) => (
          <button key={k} type="button" className={o.cls} onClick={() => onPickSlot(k)}>{o.text}</button>
        ))}
        <button type="button" className="fd-link fd-dkeep" onClick={onCancelReschedule}>Keep the old time</button>
      </div>
    </aside>
  );
}
