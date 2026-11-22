import type { StubView } from "../types";

// The note a moved card leaves in its old place: where it went, what the system does next
// (a description only), Show and Undo. A card moved by a send has no Undo (the CSS hides it).
export function MoveStub({ view, onShow, onUndo }: { view: StubView; onShow: () => void; onUndo: () => void }) {
  return (
    // Not a live region: the board announces every move once, through the shell's spoken line.
    <div className={view.className}>
      <p className="fd-kn">{view.name}</p>
      <p className="fd-stt">Moved to <b>{view.to}</b></p>
      <p className="fd-sta">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>
        <span>{view.auto}</span>
      </p>
      <div className="fd-kbs">
        <button type="button" className={view.showClassName} onClick={onShow}>Show</button>
        <button type="button" className="fd-btn is-plain fd-sun" onClick={onUndo}>Undo</button>
      </div>
    </div>
  );
}
