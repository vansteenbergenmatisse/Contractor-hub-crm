"use client";

import { useMemo, useRef } from "react";
import { PageAction, useHorizontalSwipe, useRowFocus, useSearchRows } from "@/features/app-shell";
import { buildSearchRows } from "../api/send";
import { useCardDrag } from "../hooks/use-card-drag";
import { useRevealRow } from "../hooks/use-reveal-row";
import { usePipelineBoard } from "../hooks/use-pipeline-board";
import { STAGES } from "../api/stages";
import {
  boardClass,
  cardView,
  computeLayout,
  countClass,
  emptyClass,
  gridClass,
  headerClass,
  lineSelected,
  nextStageLabel,
  stubView,
} from "../api/view";
import { MOCK_HIDDEN_COUNTS } from "../mock";
import { Arrow } from "./Arrow";
import { KanbanCard } from "./KanbanCard";
import { MoveStub } from "./MoveStub";
import { StageEmpty } from "./StageEmpty";
import { StageHeader } from "./StageHeader";
import { StageMore } from "./StageMore";
import { StageMap } from "./StageMap";
import { StagePicker } from "./StagePicker";

// The Pipeline page body: 11 stages in 4 groups. Computer: group tabs and columns. Phone: the list
// of stages, tap one to see its cards. Moving a card changes its stage on screen only (Phase 2).
// The shell wraps this in the page container, so there is no outer wrapper here.
export function PipelinePage() {
  const b = usePipelineBoard();
  const { state, cards, counts } = b;
  const layout = computeLayout(state);
  const stub = stubView(state, cards, layout);
  // A search result opens /pipeline?row=pipeline-N: open the stage the card is in now, then bring
  // the card into view. Only the cards of the open stage are offered, so the focus waits until
  // that stage shows.
  useRevealRow(state, b.pick);
  // Search finds every card in the stage it is in now.
  const found = useMemo(() => buildSearchRows(cards, state.sg), [cards, state.sg]);
  useSearchRows("pipeline", found);
  // Phone, one stage open: a swipe left on the cards goes to the next stage, right to the one before
  // (design logic `uxSwipe2`, which presses the stage bar's arrows).
  const grid = useRef<HTMLDivElement | null>(null);
  useHorizontalSwipe(grid, { onSwipeLeft: b.next, onSwipeRight: b.prev, enabled: state.open });
  // Computer: drag a card to a column. The column under the pointer takes the selected line.
  const over = useCardDrag(grid, cards.length, { stage: state.stg, canDrag: b.canDrag, canDrop: b.canDrop, onDrop: b.dropOn, onView: b.pick });
  const line = lineSelected(over >= 0 ? { ...state, stg: over } : state);
  useRowFocus(cards.flatMap((_, i) => (state.sg[i] === state.stg ? [`pipeline-${i}`] : [])));

  return (
    <div className={boardClass(state)}>
      {state.open ? (
        <PageAction>
          <span className="fx-accg">
            <button type="button" className={"fd-ibtn fd-sprev" + (b.isFirst ? " is-dis" : "")} aria-label="Previous stage" aria-disabled={b.isFirst || undefined} onClick={b.prev}>
              <Arrow size={20} />
            </button>
            {/* Only the name is live: a count that changes with a move must not speak over the move's line. */}
            <span className="fx-accst">
              <b aria-live="polite">{STAGES[state.stg].name}</b> <span>{counts[state.stg]}</span>
            </span>
            <button type="button" className={"fd-ibtn" + (b.isLast ? " is-dis" : "")} aria-label="Next stage" aria-disabled={b.isLast || undefined} onClick={b.next}>
              <Arrow size={20} />
            </button>
          </span>
        </PageAction>
      ) : null}

      <section className="fd-phd fd-in" style={{ "--i": 0 } as React.CSSProperties}>
        <h1 className="fd-pt">Pipeline</h1>
        <p className="fd-pw">
          <span className="fd-wd">Pick Sales, Delivery, Money or Later to see its stages. Job done sends a card straight to Job Done.</span>
          <span className="fd-wm">Tap a stage to see its customers.</span>
        </p>
      </section>

      <StageMap state={state} counts={counts} groups={b.groups} onGroup={(first) => b.pick(first)} onStage={(k) => b.pick(k, true)} />

      <div className="fd-snav">
        <button type="button" className="fd-link fd-sback" onClick={b.toList}>
          <Arrow size={16} />
          Stages
        </button>
        <p className="fd-snow">
          <span className="fd-snn" aria-live="polite">{STAGES[state.stg].name}</span>
          <span className="fd-kcn">{counts[state.stg]}</span>
        </p>
        <span className="fd-sarr">
          <button type="button" className={"fd-ibtn fd-sprev" + (b.isFirst ? " is-dis" : "")} aria-label="Previous stage" aria-disabled={b.isFirst || undefined} onClick={b.prev}>
            <Arrow size={20} />
          </button>
          <button type="button" className={"fd-ibtn" + (b.isLast ? " is-dis" : "")} aria-label="Next stage" aria-disabled={b.isLast || undefined} onClick={b.next}>
            <Arrow size={20} />
          </button>
        </span>
      </div>

      <section className="fd-kwrap fd-in" style={{ "--i": 2 } as React.CSSProperties} aria-label="The board">
        <div className="fd-kls" aria-hidden="true">
          {line.map((sel, j) => <i key={j} className={sel ? "is-sel" : ""} />)}
        </div>
        <div ref={grid} className={gridClass(state)}>
          {STAGES.map((st) => (
            <StageHeader key={st.index} stage={st.index} className={headerClass(state, st.index)} count={counts[st.index]} countClassName={countClass(state, st.index)} />
          ))}
          {cards.map((_, i) => {
            const view = cardView(state, cards, i, layout, b.quotes);
            return (
              <KanbanCard
                key={i}
                view={view}
                onPress={() => b.press(view)}
                onSecond={() => view.second && b.moveTo(i, view.second.to)}
                onTrash={() => b.lose(i)}
                onUndo={b.undo}
                onCalendar={() => b.openCalendar(view.card.name)}
                onSeeQuote={() => b.openQuote(view.card.name)}
                onMove={() => b.openPicker(i)}
              />
            );
          })}
          <MoveStub view={stub} onShow={b.show} onUndo={b.undo} />
          {STAGES.map((st) => <StageEmpty key={st.index} className={emptyClass(state, counts, st.index)} />)}
          {STAGES.map((st) => (MOCK_HIDDEN_COUNTS[st.index] > 0 ? <StageMore key={st.index} stage={st.index} count={MOCK_HIDDEN_COUNTS[st.index]} /> : null))}
        </div>
        {!b.isLast ? (
          <button type="button" className="fd-btn is-plain fd-knext" onClick={b.next}>
            <span>Next stage: {nextStageLabel(state, counts)}</span>
            <Arrow size={16} />
          </button>
        ) : null}
      </section>
      {b.picking !== null ? <StagePicker name={cards[b.picking].name} stage={state.sg[b.picking]} onPick={b.chooseStage} onClose={b.closePicker} /> : null}
    </div>
  );
}
