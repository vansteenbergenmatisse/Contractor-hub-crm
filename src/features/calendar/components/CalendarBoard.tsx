"use client";

import { useCallback, useEffect, useReducer, useRef, type CSSProperties, type MouseEvent } from "react";
import { PageAction, usePushed, Icon } from "@/features/app-shell";
import { dayAtX, slotAtY } from "../api/grid";
import { calendarReducer, initialState } from "../api/state";
import { buildView } from "../api/view";
import { DAYS, GRID_ROWS } from "../api/dates";
import { useStopDrag } from "../hooks/use-stop-drag";
import { MOCK_STOPS } from "../mock";
import type { CalendarBusiness } from "../types";
import { AddSheet } from "./AddSheet";
import { CalendarActions } from "./CalendarActions";
import { CalendarHeader } from "./CalendarHeader";
import { ConfirmDelete } from "./ConfirmDelete";
import { Glyph } from "./Glyph";
import { StopDetail } from "./StopDetail";

const HOURS = ["7 AM", "8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM"];
const DESKTOP = 1024;

// The page body for a known `now`. All state is local and mock: nothing is fetched, saved or sent.
export function CalendarBoard({ now, business, row = null }: { now: Date; business: CalendarBusiness; row?: string | null }) {
  // A stop named in the URL (?row=<id>) opens on the first render, and again when the URL names another.
  const [state, dispatch] = useReducer(calendarReducer, undefined, () => {
    const first = initialState(MOCK_STOPS, now);
    return row ? calendarReducer(first, { type: "openRow", id: row }) : first;
  });
  useEffect(() => {
    if (row) dispatch({ type: "openRow", id: row });
  }, [row]);
  const v = buildView(state, now, business);
  const gridRef = useRef<HTMLDivElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  usePushed(v.detail.open);

  // A new day or week starts at the top of the page.
  useEffect(() => {
    if (state.ev === "nav") document.querySelector(".fd-main")?.scrollTo?.(0, 0);
  }, [state.ev, state.sw]);

  const drag = useStopDrag({
    gridRef,
    enabled: state.view === "week",
    onDrop: useCallback((id: string, day: number, start: number) => dispatch({ type: "move", id, to: { week: state.wk, day, start } }), [state.wk]),
  });

  // Double-click a free time in the week (computer) opens New estimate with that time first.
  const onGridDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    const grid = gridRef.current;
    if (!grid || state.view !== "week" || window.innerWidth < DESKTOP) return;
    if ((event.target as HTMLElement).closest(".fd-ev")) return;
    const rect = grid.getBoundingClientRect();
    const style = getComputedStyle(grid);
    const day = dayAtX(event.clientX, rect.left, style.gridTemplateColumns.split(" ").map(parseFloat));
    if (day < 0) return;
    const start = Math.min(slotAtY(event.clientY, rect.top, parseFloat(style.gridTemplateRows) || 26), GRID_ROWS - 2);
    dispatch({ type: "openAdd", kind: "E", slot: { week: state.wk, day, start } });
  };

  const copyLink = () => {
    try { void navigator.clipboard.writeText(`https://${v.booking.link}`).catch(() => {}); } catch { /* no clipboard: the button still says Copied */ }
    dispatch({ type: "copyLink" });
  };

  const pickMove = (k: number) => {
    const place = v.detail.options[k]?.place;
    if (place && state.selId) dispatch({ type: "move", id: state.selId, to: place });
  };
  const pickAdd = (k: number) => {
    const o = v.add.options[k];
    if (o) dispatch({ type: "submitAdd", placement: o.place });
  };

  const nowStyle: CSSProperties | undefined = v.now ? { gridColumn: v.now.column, gridRow: v.now.row } : undefined;
  const sel = state.selId;

  return (
    <div className={v.calCls}>
      <PageAction>
        <CalendarActions
          onPrevWeek={() => dispatch({ type: "nav", wk: state.wk - 1, sd: state.sd })}
          onNextWeek={() => dispatch({ type: "nav", wk: state.wk + 1, sd: state.sd })}
          onToday={() => dispatch({ type: "today", day: now.getDay() })}
          onAddEstimate={() => dispatch({ type: "openAdd", kind: "E" })}
          onAddJob={() => dispatch({ type: "openAdd", kind: "J" })}
        />
      </PageAction>
      <CalendarHeader />

      <div className="fd-cbar fd-in" style={{ "--i": 1 } as CSSProperties}>
        <span className="fd-cnav">
          <button type="button" className={v.arrows.prev.cls} aria-label={v.arrows.prev.label} onClick={() => dispatch({ type: "step", n: -1 })}><Icon name="right" size={20} strokeWidth={2.2} /></button>
          <button type="button" className={v.arrows.prevWeekCls} aria-label="The week before" onClick={() => dispatch({ type: "nav", wk: state.wk - 1, sd: state.sd })}><Icon name="right" size={20} strokeWidth={2.2} /></button>
          <button type="button" className="fd-btn is-plain fd-ctoday" onClick={() => dispatch({ type: "today", day: now.getDay() })}>Today</button>
          <button type="button" className={v.arrows.next.cls} aria-label={v.arrows.next.label} onClick={() => dispatch({ type: "step", n: 1 })}><Icon name="right" size={20} strokeWidth={2.2} /></button>
          <button type="button" className={v.arrows.nextWeekCls} aria-label="The week after" onClick={() => dispatch({ type: "nav", wk: state.wk + 1, sd: state.sd })}><Icon name="right" size={20} strokeWidth={2.2} /></button>
        </span>
        <h2 className="fd-crange" aria-live="polite"><span className="fd-crk">{v.weekText}</span><span className="fd-crd">{v.dayText}</span></h2>
        <span className="fd-cleg" aria-label="What the colors mean"><span className="fd-kind is-estimate">Estimate</span><span className="fd-kind is-job">Job</span></span>
        <div className="fd-cseg" role="group" aria-label="View">
          <span className={v.segThumb} aria-hidden="true" />
          <button type="button" className={v.seg.week.cls} aria-pressed={v.seg.week.pressed} onClick={() => dispatch({ type: "setView", view: "week" })}>Week</button>
          <button type="button" className={v.seg.day.cls} aria-pressed={v.seg.day.pressed} onClick={() => dispatch({ type: "setView", view: "day" })}>Day</button>
        </div>
      </div>

      <p className="fd-csyncl">
        <span className="fd-chip fd-csync is-plain">Not available yet</span>
        <span className="fd-csynct">
          The calendar this syncs with shows here once it can be read.{" "}
          <span className="fd-wd">Drag a stop to move it. Double-click a free time to add an estimate.</span>
          <span className="fd-wm">Tap a stop to move it.</span>
        </span>
        <button type="button" className="fd-btn fd-cadd" onClick={() => dispatch({ type: "openAdd", kind: "E" })}><Icon name="plus" size={15} strokeWidth={2.2} />Add estimate</button>
        <button type="button" className="fd-btn is-plain fd-cadd" onClick={() => dispatch({ type: "openAdd", kind: "J" })}><Icon name="plus" size={15} strokeWidth={2.2} />Add job</button>
      </p>
      <p className="fd-cbk">
        <Glyph name="cal" size={16} />
        <span>A customer who accepts a quote gets a booking link{v.booking.link ? <>: <b>{v.booking.link}</b></> : null}. The job lands here and the card moves to Job Scheduled. You get an alert.{v.booking.hours ? ` Open ${v.booking.hours}.` : ""}</span>
        {v.booking.link ? <button type="button" className="fd-btn is-plain" onClick={copyLink}>{v.booking.copyText}</button> : null}
      </p>

      <ConfirmDelete
        confirm={v.confirm}
        onReschedule={() => dispatch({ type: "rescheduleInstead" })}
        onYes={() => dispatch({ type: "confirmDelete" })}
        onNo={() => dispatch({ type: "cancelDelete" })}
        undoRef={undoRef}
      />
      <p className={`fd-cdl${v.undoDelete.open ? "" : " is-off"}`} role="status"><span>{v.undoDelete.text}</span><button ref={undoRef} type="button" className="fd-link" onClick={() => dispatch({ type: "undoDelete" })}>Undo</button></p>
      <p className={`fd-cdl fd-cns${v.added ? "" : " is-off"}`}>
        <span>{v.added?.text ?? ""}</span>
        <button type="button" className="fd-btn is-danger" onClick={() => sel && dispatch({ type: "askDelete", id: sel })}><Glyph name="trash" />Delete</button>
        <button type="button" className="fd-link" onClick={() => dispatch({ type: "closeDetail" })}>Close</button>
      </p>
      <AddSheet add={v.add} name={state.addName} onName={(name) => dispatch({ type: "setAddName", name })} onPick={pickAdd} onClose={() => dispatch({ type: "closeAdd" })} />

      <section className="fd-cbody fd-in" style={{ "--i": 2 } as CSSProperties} aria-label="The calendar">
        <div className="fd-cdays">
          <span className="fd-cgut" aria-hidden="true" />
          {v.days.map((d) => (
            <button key={d.index} type="button" className={d.cls} aria-pressed={d.pressed} aria-label={d.label} onClick={() => dispatch({ type: "selectDay", day: d.index })}>
              <span className="fd-cdn">{DAYS[d.index]}</span><span className="fd-cdd">{d.num}</span><span className="fd-cdot" aria-hidden="true" />
            </button>
          ))}
        </div>
        <p className="fd-ctitle" aria-live="polite"><b>{v.dayTitle}</b><span>{v.daySummary}</span></p>
        <div ref={gridRef} className={v.gridCls} onDoubleClick={onGridDoubleClick}>
          {HOURS.map((h, k) => {
            const row = 2 * k + 1;
            // The design hides the 10 AM label under its now line; a different attribute value keeps it when the line is elsewhere.
            const style = (row === 7 && !v.hideTenAm ? { "--r": row, "--shown": 1 } : { "--r": row }) as unknown as CSSProperties;
            return <span key={h} className="fd-chr" style={style}>{h}</span>;
          })}
          {[0, 1, 2, 3, 4, 5, 6].map((d) => <i key={d} className={`fd-ccol is-d${d}${state.wk === 0 && now.getDay() === d ? " is-today" : ""}`} />)}
          {v.now ? <><i className="fd-now" style={nowStyle} aria-hidden="true" /><i className="fx-nowl" style={{ gridRow: v.now.row }} aria-hidden="true">{v.now.label}</i></> : null}
          {v.events.map((e) => (
            <button
              key={e.id}
              type="button"
              className={e.cls}
              aria-pressed={e.selected}
              onPointerDown={(ev) => { if (!e.cls.includes("is-past")) drag.onPointerDown(ev, e.id, e.len); }}
              onClick={() => { if (!drag.consumeClick()) dispatch({ type: "pick", id: e.id }); }}
            >
              <span className="fd-et1">{e.start} · {e.kind === "J" ? "Job" : "Estimate"}</span>
              <span className="fd-et2"><b>{e.start}</b>{e.added ? null : <i>to {e.end}</i>}</span>
              {e.added ? null : <span className="fd-ekt"><span className={`fd-kind ${e.kind === "J" ? "is-job" : "is-estimate"}`}>{e.kind === "J" ? "Job" : "Estimate"}</span></span>}
              <span className="fd-enm">{e.name}</span>
              <span className="fd-esv">{e.added ? "Added by you" : e.service}</span>
              {e.added ? null : <span className="fd-ead"><Glyph name="pin" size={14} />{e.address}</span>}
              {e.added ? null : <span className="fd-ech" aria-hidden="true"><Icon name="right" size={18} strokeWidth={2.2} /></span>}
            </button>
          ))}
          <div className={v.emptyCls}><p>Nothing booked this day.</p><button type="button" className="fd-btn is-plain" onClick={() => dispatch({ type: "openAdd", kind: "E" })}>Add estimate</button></div>
          <StopDetail
            detail={v.detail}
            deleteLabel={`Delete ${v.detail.kind ? v.detail.kind.toLowerCase() : "stop"}`}
            onClose={() => dispatch({ type: "closeDetail" })}
            onReschedule={() => dispatch({ type: "openReschedule" })}
            onCancelReschedule={() => dispatch({ type: "cancelReschedule" })}
            onPickSlot={pickMove}
            onUndoMove={() => dispatch({ type: "undoMove" })}
            onDelete={() => sel && dispatch({ type: "askDelete", id: sel })}
          />
        </div>
      </section>
    </div>
  );
}
