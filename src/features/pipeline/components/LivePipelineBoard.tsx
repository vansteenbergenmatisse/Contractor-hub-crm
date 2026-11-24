"use client";

import { useEffect, useId, useMemo, useRef } from "react";
import { PageAction, useHorizontalSwipe, useRowFocus, useSearchRows } from "@/features/app-shell";
import { boardChunks, chunkLabel, chunkOfStage, chunkSpan, columnScroll, liveSearchRows, slotOfStage } from "../api/live-board";
import { useLiveBoard } from "../hooks/use-live-board";
import type { PipelineResult } from "../types";
import { Arrow } from "./Arrow";
import { LivePipelineCard } from "./LivePipelineCard";
import { LivePipelineHeader } from "./LivePipelineHeader";
import { PipelineSwitcher } from "./PipelineSwitcher";
import { StageEmpty } from "./StageEmpty";

type Ready = Extract<PipelineResult, { state: "ready" }>;

// The real board, on the design's classes. Computer: tabs of up to five stage columns. Phone: the
// list of stages, tap one to see its deals. Looking is all it does: no move, drag or send.
export function LivePipelineBoard({ result }: { result: Ready }) {
  const { columns, pipelines, pipelineId, complete, dropped } = result;
  const b = useLiveBoard(columns);
  const noteId = useId();
  const grid = useRef<HTMLDivElement | null>(null);
  const rows = useMemo(() => liveSearchRows(columns, pipelineId), [columns, pipelineId]);
  useSearchRows("pipeline", rows);
  useHorizontalSwipe(grid, { onSwipeLeft: b.next, onSwipeRight: b.prev, enabled: b.open });
  useRowFocus(columns[b.stage].cards.map((card) => `pipeline-${card.id}`));
  // On a narrow computer or tablet the board scrolls sideways: keep the chosen stage in view.
  useEffect(() => {
    const wrap = grid.current?.parentElement;
    const header = grid.current?.querySelector<HTMLElement>(".fd-kh.is-sel");
    if (!wrap || !header) return;
    const left = columnScroll({ left: header.offsetLeft, width: header.offsetWidth }, { scrollLeft: wrap.scrollLeft, viewWidth: wrap.clientWidth });
    if (left !== wrap.scrollLeft) wrap.scrollTo({ left });
  }, [b.stage]);

  const chunks = boardChunks(columns.length);
  const inView = chunkOfStage(b.stage);
  const chunk = chunks[inView];
  const visible = columns.slice(chunk.first, chunk.last + 1);
  const current = columns[b.stage];
  const count = (first: number, last: number) => columns.slice(first, last + 1).reduce((sum, column) => sum + column.cards.length, 0);
  const notes = [!complete ? "Not every deal is shown. Your CRM has the full list." : "", dropped > 0 ? `${dropped} ${dropped === 1 ? "deal" : "deals"} could not be read.` : ""].filter(Boolean);
  const arrows = (
    <>
      <button type="button" className={"fd-ibtn fd-sprev" + (b.isFirst ? " is-dis" : "")} aria-label="Previous stage" aria-disabled={b.isFirst || undefined} onClick={b.prev}><Arrow size={20} /></button>
      <button type="button" className={"fd-ibtn" + (b.isLast ? " is-dis" : "")} aria-label="Next stage" aria-disabled={b.isLast || undefined} onClick={b.next}><Arrow size={20} /></button>
    </>
  );

  return (
    <div className={`fd-kb is-g0 is-st${slotOfStage(b.stage)}${b.open ? " is-open" : ""}`}>
      {b.open ? (
        <PageAction>
          <span className="fx-accg">
            <span className="fx-accst"><b aria-live="polite">{current.name}</b> <span>{current.cards.length}</span></span>
            {arrows}
          </span>
        </PageAction>
      ) : null}

      <LivePipelineHeader noteId={noteId} />
      <PipelineSwitcher pipelines={pipelines} current={pipelineId} />
      {notes.length > 0 ? <p className="fd-pw" role="status">{notes.join(" ")}</p> : null}

      <nav className="fd-smapw fd-in" style={{ "--i": 1 } as React.CSSProperties} aria-label="Stages">
        <div className="fd-smap">
          {chunks.map((c, j) => {
            const label = chunkLabel(c, columns.length);
            return (
              <div key={c.first} className="fd-sg" style={{ "--n": c.last - c.first + 1 } as React.CSSProperties}>
                <p className="fd-sgl">{label}</p>
                <button type="button" className={"fd-sgb" + (j === inView ? " is-on" : "")} aria-pressed={j === inView} onClick={() => b.pick(c.first)}>
                  <span className="fd-sgn">{label}</span>
                  <span className="fd-sgc">{count(c.first, c.last)}</span>
                  <span className="fd-sgs">{chunkSpan(c, columns.map((column) => column.name))}</span>
                </button>
                <div className="fd-sgt">
                  {columns.slice(c.first, c.last + 1).map((column, n) => {
                    const stage = c.first + n;
                    return (
                      <button key={column.id} type="button" className={"fd-sti" + (j === inView ? " is-in" : "") + (stage === b.stage ? " is-on" : "")} aria-pressed={stage === b.stage} onClick={() => b.pick(stage, true)}>
                        <span className="fd-kcn">{column.cards.length}</span>
                        <span className="fd-stn">{column.name}</span>
                        <Arrow size={16} />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </nav>

      <div className="fd-snav">
        <button type="button" className="fd-link fd-sback" onClick={b.toList}><Arrow size={16} />Stages</button>
        <p className="fd-snow"><span className="fd-snn" aria-live="polite">{current.name}</span><span className="fd-kcn">{current.cards.length}</span></p>
        <span className="fd-sarr">{arrows}</span>
      </div>

      <section className="fd-kwrap fd-in" style={{ "--i": 2 } as React.CSSProperties} aria-label="The board" tabIndex={0}>
        <div className="fd-kls" aria-hidden="true">
          {visible.map((column, slot) => <i key={column.id} className={slot === slotOfStage(b.stage) ? "is-sel" : ""} />)}
        </div>
        <div ref={grid} className="fd-kg">
          {visible.map((column, slot) => (
            <header key={column.id} className={`fd-kh is-s${slot}${slot === slotOfStage(b.stage) ? " is-sel" : ""}`}>
              <h2 className="fd-khn">{column.name}</h2>
              <span className="fd-kcn">{column.cards.length}</span>
            </header>
          ))}
          {visible.flatMap((column, slot) => column.cards.map((card, rank) => <LivePipelineCard key={card.id} card={card} slot={slot} rank={rank} noteId={noteId} />))}
          {visible.map((column, slot) => <StageEmpty key={column.id} className={`fd-kempty is-s${slot}${column.cards.length ? " is-off" : ""}`} />)}
        </div>
        {!b.isLast ? (
          <button type="button" className="fd-btn is-plain fd-knext" onClick={b.next}>
            <span>{`Next stage: ${columns[b.stage + 1].name} (${columns[b.stage + 1].cards.length})`}</span>
            <Arrow size={16} />
          </button>
        ) : null}
      </section>
    </div>
  );
}
