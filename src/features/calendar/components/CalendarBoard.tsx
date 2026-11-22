"use client";

import { useCallback, useEffect, useRef, type CSSProperties, type MouseEvent } from "react";
import { PageAction, Icon, ROW_PICK_EVENT, useHorizontalSwipe, useKeptReducer, useRowFocus } from "@/features/app-shell";
import { dayAtX, slotAtY } from "../api/grid";
import { calendarReducer, initialState } from "../api/state";
import { buildView } from "../api/view";
import { DAYS, GRID_ROWS } from "../api/dates";
import { useStopDrag } from "../hooks/use-stop-drag";
import { mockStopsFor } from "../mock";
import type { CalendarBusiness } from "../types";
import { AddSheet } from "./AddSheet";
import { CalendarActions } from "./CalendarActions";
import { CalendarHeader } from "./CalendarHeader";
import { ConfirmDelete } from "./ConfirmDelete";
import { Glyph } from "./Glyph";
import { StopDetail } from "./StopDetail";
import { StopEvent } from "./StopEvent";

const HOURS = ["7 AM", "8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM"];
const DESKTOP = 1024;

// The page body for a known `now`. All state is mock: nothing is fetched, saved or sent. The state is
// kept by the shell while the owner visits other pages (as in the design), and is gone on a reload.
export function CalendarBoard({ now, business, row = null }: { now: Date; business: CalendarBusiness; row?: string | null }) {
  // A stop named in the URL (?row=<id>) opens on the first render, and again when the URL names another
  // (also while the page is already open: the route re-renders with the new `row`).
  const [state, dispatch] = useKeptReducer("calendar", calendarReducer, now, (at: Date) => {
    const first = initialState(mockStopsFor(at), at);
    return row ? calendarReducer(first, { type: "openRow", id: row }) : first;
  });
  useEffect(() => {
    if (row) dispatch({ type: "openRow", id: row });
  }, [row, dispatch]);
  const v = buildView(state, now, business);
  const gridRef = useRef<HTMLDivElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const daysRef = useRef<HTMLDivElement>(null);
  // An open stop keeps the tab bar and the action bar: Calendar is not a pushed screen in the design.

  // The same search result picked again (the URL does not change): the stop opens again (design `uxOpen`).
  useEffect(() => {
    if (!row) return;
    const onPick = (event: Event) => {
      if ((event as CustomEvent<unknown>).detail === row) dispatch({ type: "openRow", id: row });
    };
    window.addEventListener(ROW_PICK_EVENT, onPick);
    return () => window.removeEventListener(ROW_PICK_EVENT, onPick);
  }, [row, dispatch]);

  // Phone: swipe the day strip left for the week after, right for the week before (design `uxSwipe2`).
  useHorizontalSwipe(daysRef, {
    onSwipeLeft: () => dispatch({ type: "nav", wk: state.wk + 1, sd: state.sd }),
    onSwipeRight: () => dispatch({ type: "nav", wk: state.wk - 1, sd: state.sd }),
  });

  // A new day or week starts at the top of the page.
  useEffect(() => {
    if (state.ev === "nav") document.querySelector(".fd-main")?.scrollTo?.(0, 0);
  }, [state.ev, state.sw]);
  // After that: the stop a search result names is scrolled to, focused and ringed (useRowFocus also
  // reacts to a new ?row= while the page is open).
  useRowFocus(v.events.map((e) => e.id));

  // Close the open stop (X, Close or Escape) and give focus back to the stop button that opened it.
  const closeDetail = useCallback(() => {
    const id = state.selId;
    dispatch({ type: "closeDetail" });
    if (id) Array.from(document.querySelectorAll<HTMLElement>(".fd-cg [data-row-id]")).find((el) => el.dataset.rowId === id)?.focus();
  }, [state.selId, dispatch]);

  // Escape closes the stop detail (design: after the delete question and the add sheet, which close first).
  const detailOpen = v.detail.open || !!v.added;
  const busy = !!state.confirmId || !!state.add;
  useEffect(() => {
    if (!detailOpen || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      closeDetail();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [detailOpen, busy, closeDetail]);

  const drag = useStopDrag({
    gridRef,
    enabled: state.view === "week",
    onDrop: useCallback((id: string, day: number, start: number) => dispatch({ type: "move", id, to: { week: state.wk, day, start } }), [state.wk, dispatch]),
  });

  // A free time in the computer week grid (not a stop, not the panel): design `uxCal`.
  const onFreeTime = (event: MouseEvent<HTMLDivElement>): boolean => {
    if (state.view !== "week" || window.innerWidth < DESKTOP) return false;
    return !(event.target as HTMLElement).closest("button, .fd-ev, .fd-cdet, input");
  };
  // One click on a free time closes the open stop (not while the add sheet is open).
  const onGridClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!onFreeTime(event) || drag.consumeClick()) return;
    if (state.selId && !state.add) dispatch({ type: "closeDetail" });
  };

  // Double-click a free time in the week (computer) opens New estimate with that time first.
  const onGridDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    const grid = gridRef.current;
    if (!grid || !onFreeTime(event)) return;
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
      {/* The phone action bar steps aside while the add sheet is open (design `uxAcc`). Hidden, not
          removed: its Estimate/Job button stays in the page, so the sheet gives focus back to it. */}
      <PageAction hidden={!!state.add}>
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
        {/* The design's chip markup for this spot. The tinted pill is its synced state (is-ok + check); with
            no synced calendar to read it stays the design's own not-synced look, is-plain. */}
        <span className="fd-chip fd-csync is-plain"><Glyph name="check" size={13} strokeWidth={2.2} className="i-o" /><span className="fd-h">Not available yet</span></span>
        <span className="fd-csynct">
          Connect your calendar in Settings.{" "}
          <span className="fd-wd">Drag a stop to move it. Double-click a free time to add an estimate.</span>
          <span className="fd-wm">Tap a stop to move it.</span>
        </span>
        <button type="button" className="fd-btn fd-cadd" onClick={() => dispatch({ type: "openAdd", kind: "E" })}><Icon name="plus" size={15} strokeWidth={2.2} />Add estimate</button>
        <button type="button" className="fd-btn is-plain fd-cadd" onClick={() => dispatch({ type: "openAdd", kind: "J" })}><Icon name="plus" size={15} strokeWidth={2.2} />Add job</button>
      </p>
      {/* A div, so the design's .fd-cbk bottom margin applies (the .fd-app p reset removes it from a p):
          the line no longer touches the day strip on a phone. */}
      <div className="fd-cbk">
        <Glyph name="cal" size={16} />
        <span>A customer who accepts a quote gets a booking link{v.booking.link ? <>: <b>{v.booking.link}</b></> : null}. The job lands here and the card moves to Job Scheduled. You get an alert.{v.booking.hours ? ` Open ${v.booking.hours}.` : ""}</span>
        {v.booking.link ? <button type="button" className="fd-btn is-plain" onClick={copyLink}>{v.booking.copyText}</button> : null}
      </div>

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
        <button type="button" className="fd-link" onClick={closeDetail}>Close</button>
      </p>
      <AddSheet add={v.add} name={state.addName} onName={(name) => dispatch({ type: "setAddName", name })} onPick={pickAdd} onClose={() => dispatch({ type: "closeAdd" })} />

      <section className="fd-cbody fd-in" style={{ "--i": 2 } as CSSProperties} aria-label="The calendar">
        <div ref={daysRef} className="fd-cdays">
          <span className="fd-cgut" aria-hidden="true" />
          {v.days.map((d) => (
            <button key={d.index} type="button" className={d.cls} aria-pressed={d.pressed} aria-label={d.label} onClick={() => dispatch({ type: "selectDay", day: d.index })}>
              <span className="fd-cdn">{DAYS[d.index]}</span><span className="fd-cdd">{d.num}</span><span className="fd-cdot" aria-hidden="true" />
            </button>
          ))}
        </div>
        <p className="fd-ctitle" aria-live="polite"><b>{v.dayTitle}</b><span>{v.daySummary}</span></p>
        <div ref={gridRef} className={v.gridCls} onClick={onGridClick} onDoubleClick={onGridDoubleClick}>
          {HOURS.map((h, k) => {
            const row = 2 * k + 1;
            // The design hides the 10 AM label under its now line; a different attribute value keeps it when the line is elsewhere.
            const style = (row === 7 && !v.hideTenAm ? { "--r": row, "--shown": 1 } : { "--r": row }) as unknown as CSSProperties;
            return <span key={h} className="fd-chr" style={style}>{h}</span>;
          })}
          {[0, 1, 2, 3, 4, 5, 6].map((d) => <i key={d} className={`fd-ccol is-d${d}${state.wk === 0 && now.getDay() === d ? " is-today" : ""}`} />)}
          {v.now ? <><i className="fd-now" style={nowStyle} aria-hidden="true" /><i className="fx-nowl" style={{ gridRow: v.now.row }} aria-hidden="true">{v.now.label}</i></> : null}
          {v.events.map((e) => (
            <StopEvent
              key={e.id}
              event={e}
              onPointerDown={(ev) => { if (!e.cls.includes("is-past")) drag.onPointerDown(ev, e.id, e.len); }}
              onClick={() => { if (!drag.consumeClick()) dispatch({ type: "pick", id: e.id }); }}
              onOpen={() => dispatch({ type: "pick", id: e.id })}
              // As in the design (`uxItems`): the stop opens first, then its own button is pressed. A stop
              // you added has no panel with those buttons, so for it the item only opens its line.
              onReschedule={() => {
                if (!e.selected) dispatch({ type: "pick", id: e.id });
                if (!e.added) dispatch({ type: "openReschedule" });
              }}
              onDelete={() => {
                if (!e.selected) dispatch({ type: "pick", id: e.id });
                if (!e.added) dispatch({ type: "askDelete", id: e.id });
              }}
            />
          ))}
          <div className={v.emptyCls}><p>Nothing booked this day.</p><button type="button" className="fd-btn is-plain" onClick={() => dispatch({ type: "openAdd", kind: "E" })}>Add estimate</button></div>
          <StopDetail
            detail={v.detail}
            deleteLabel={`Delete ${v.detail.kind ? v.detail.kind.toLowerCase() : "stop"}`}
            onClose={closeDetail}
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
