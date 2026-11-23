import { MAX_LIVE_RANK } from "../api/live-board";
import type { LiveCard } from "../types";

// One real deal, read-only. Its only button is Move, disabled, and described by the page's note.
export function LivePipelineCard({ card, slot, rank, noteId }: { card: LiveCard; slot: number; rank: number; noteId: string }) {
  return (
    <article className={`fd-kc is-s${slot} is-r${Math.min(rank, MAX_LIVE_RANK)}`} aria-label={card.name} data-row-id={`pipeline-${card.id}`} tabIndex={-1}>
      <div className="fd-kt">
        <span className="fd-av" aria-hidden="true">{card.init}</span>
        <div className="fd-kx">
          <p className="fd-kn">{card.name}</p>
          {card.detail ? <p className="fd-ks">{card.detail}</p> : null}
        </div>
      </div>
      <p className="fd-km">
        {card.amount ? <b>{card.amount}</b> : null}
        {card.since ? <span>{card.since}</span> : null}
      </p>
      <div className="fd-kbs">
        <button type="button" className="fd-btn is-plain fd-k2" disabled aria-label={`Move ${card.name}: not available yet`} aria-describedby={noteId}>Move</button>
      </div>
    </article>
  );
}
