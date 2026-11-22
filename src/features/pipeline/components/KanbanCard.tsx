import type { CardView } from "../types";

const svgProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false } as const;

// One customer card. The same component draws every card in every stage; `view` says what it shows.
export function KanbanCard({
  view,
  onPress,
  onSecond,
  onTrash,
  onUndo,
  onCalendar,
  onSeeQuote,
}: {
  view: CardView;
  onPress: () => void;
  onSecond: () => void;
  onTrash: () => void;
  onUndo: () => void;
  onCalendar: () => void;
  onSeeQuote: () => void;
}) {
  const { card, primary, second } = view;
  return (
    <article className={view.className} aria-label={card.name} data-row-id={`pipeline-${view.i}`}>
      <div className="fd-kt">
        <span className="fd-av" aria-hidden="true">{card.init}</span>
        <div className="fd-kx">
          <p className="fd-kn">{card.name}</p>
          <p className="fd-ks">{card.service}</p>
        </div>
        {/* Always drawn, as in the design: off, it is hidden and out of reach, and the CSS
            (.fd-kcal.is-off + .fd-klost) uses it to push the trash button to the right. */}
        <button
          type="button"
          className={"fd-ibtn fd-kcal" + (view.calendar ? "" : " is-off")}
          aria-label={`Open ${card.name} in the calendar`}
          tabIndex={view.calendar ? undefined : -1}
          aria-hidden={view.calendar ? undefined : true}
          onClick={view.calendar ? onCalendar : undefined}
        >
          <svg width="16" height="16" strokeWidth="2" {...svgProps}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
        </button>
        {view.trash ? (
          <button type="button" className="fd-ibtn fd-klost" aria-label={`Move ${card.name} to Lost`} onClick={onTrash}>
            <svg width="16" height="16" strokeWidth="2" {...svgProps}><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></svg>
          </button>
        ) : null}
      </div>
      <p className="fd-kad">
        <svg width="13" height="13" strokeWidth="2" {...svgProps}><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
        <span>{card.address}</span>
      </p>
      <p className="fd-km">
        {card.amount ? <b>{card.amount}</b> : null}
        <span>{view.timeText}</span>
        {view.showUndo ? <button type="button" className="fd-link fd-kun" onClick={onUndo}>Undo</button> : null}
      </p>
      <p className="fd-ka">
        <svg width="13" height="13" strokeWidth="2" {...svgProps}><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>
        <span>{view.autoText}</span>
      </p>
      <p className="fd-ktg">
        {view.tags.map((tag, n) => (tag ? <span key={n} className={`fd-chip ${tag.cls}`}>{tag.text}</span> : null))}
      </p>
      <div className="fd-kbs">
        <button type="button" className="fd-btn fd-k1" onClick={onPress}>{primary.label}</button>
        {second ? <button type="button" className="fd-btn is-plain fd-k2" onClick={onSecond}>{second.label}</button> : null}
        {view.seeQuote ? <button type="button" className="fd-btn is-plain fd-k3" onClick={onSeeQuote}>See quote</button> : null}
      </div>
    </article>
  );
}
