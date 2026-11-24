"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { Icon, PageAction } from "@/features/app-shell";
import { clockLabel, nowPosition } from "../api/dates";
import { zonedParts } from "../api/live-week";
import { useDesktopGrid } from "../hooks/use-desktop-grid";
import { useNow } from "../hooks/use-now";
import type { CalendarResult, LiveFreeTimes, LiveStop } from "../types";
import { CalendarHeader } from "./CalendarHeader";
import { FreeTimesLine } from "./FreeTimesLine";
import { Glyph } from "./Glyph";
import { LiveStopDetail } from "./LiveStopDetail";
import { LiveStopEvent } from "./LiveStopEvent";

const HOURS = ["7 AM", "8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM"];
const NOT_YET = "Not available here yet";
const NO_STOPS: LiveStop[] = [];

const summary = (count: number) => (count ? `${count} ${count === 1 ? "stop" : "stops"}` : "Nothing booked");
const weekHref = (week: string) => `/calendar?week=${week}`;

// One real week, read-only, in the design's layout. Week moves are links, so the server reads that
// week. Free times are information only, because nothing can be booked here.
export function CalendarWeekBoard({ result, fixedNow, free }: { result: Extract<CalendarResult, { state: "ready" | "empty" }>; fixedNow?: Date; free?: LiveFreeTimes }) {
  const { week } = result;
  const stops = result.state === "ready" ? result.stops : NO_STOPS;
  const [view, setView] = useState<"week" | "day">("week");
  const [day, setDay] = useState(week.todayDay ?? stops[0]?.day ?? 0);
  const [selId, setSelId] = useState<string | null>(null);
  const desktop = useDesktopGrid();
  const clock = useNow(fixedNow);

  useEffect(() => {
    if (!selId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      setSelId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selId]);

  const weekView = view === "week";
  const selected = stops.find((s) => s.id === selId) ?? null;
  const today = week.todayDay;
  const isCurrent = today !== null;
  const dayInfo = week.days[day];

  let nowLine: { row: number; column: number; label: string } | null = null;
  if (clock && isCurrent && weekView) {
    const p = zonedParts(clock.getTime(), week.timeZone);
    const position = p.weekday === today ? nowPosition(new Date(p.year, p.month - 1, p.day, p.hour, p.minute)) : null;
    if (position) nowLine = { row: position.row, column: position.column, label: clockLabel(new Date(p.year, p.month - 1, p.day, p.hour, p.minute)) };
  }
  const nowStyle: CSSProperties | undefined = nowLine ? { gridColumn: nowLine.column, gridRow: nowLine.row } : undefined;

  const laneStyle = (stop: LiveStop): CSSProperties | undefined => (desktop && weekView && stop.lanes > 1
    ? { justifySelf: "start", width: `calc((100% - 7px) / ${stop.lanes})`, marginLeft: `calc(4px + (100% - 7px) * ${stop.lane} / ${stop.lanes})`, marginRight: 0 }
    : undefined);

  const emptyLine = result.state === "empty"
    ? (result.reason === "no-calendars" ? "No calendars are set up yet." : "Nothing booked this week.")
    : "Nothing booked this day.";
  const dayHasStops = stops.some((s) => s.day === day);
  const arrow = (prev: boolean, where: string) => `fd-ibtn fd-carr${prev ? " fd-cprev" : ""} ${where}`;

  return (
    <div className={`fd-cal${isCurrent ? " is-w1" : ""} is-sd${day}${weekView ? "" : " is-day"}`}>
      <PageAction>
        <span className="fx-accg">
          <Link className="fd-ibtn" aria-label="The week before" href={weekHref(week.prevWeek)}><Icon name="left" size={20} strokeWidth={2} /></Link>
          <Link className="fd-btn is-plain" aria-label="Go to today's week" href="/calendar">Today</Link>
          <Link className="fd-ibtn" aria-label="The week after" href={weekHref(week.nextWeek)}><Icon name="right" size={20} strokeWidth={2} /></Link>
          <button type="button" className="fd-btn" disabled title={NOT_YET} aria-label="Add estimate, not available here yet"><Icon name="plus" size={16} strokeWidth={2} /><span>Estimate</span></button>
          <button type="button" className="fd-btn is-plain" disabled title={NOT_YET} aria-label="Add job, not available here yet"><Icon name="plus" size={16} strokeWidth={2} /><span>Job</span></button>
        </span>
      </PageAction>
      <CalendarHeader readOnly />

      <div className="fd-cbar fd-in" style={{ "--i": 1 } as CSSProperties}>
        <span className="fd-cnav">
          <Link className={arrow(true, "fd-cdesk")} aria-label="The week before" href={weekHref(week.prevWeek)}><Icon name="right" size={20} strokeWidth={2.2} /></Link>
          <Link className={arrow(true, "fd-cphone")} aria-label="The week before" href={weekHref(week.prevWeek)}><Icon name="right" size={20} strokeWidth={2.2} /></Link>
          <Link className="fd-btn is-plain fd-ctoday" href="/calendar">Today</Link>
          <Link className={arrow(false, "fd-cdesk")} aria-label="The week after" href={weekHref(week.nextWeek)}><Icon name="right" size={20} strokeWidth={2.2} /></Link>
          <Link className={arrow(false, "fd-cphone")} aria-label="The week after" href={weekHref(week.nextWeek)}><Icon name="right" size={20} strokeWidth={2.2} /></Link>
        </span>
        <h2 className="fd-crange" aria-live="polite"><span className="fd-crk">{week.rangeLabel}</span><span className="fd-crd">{dayInfo.long}</span></h2>
        <div className="fd-cseg" role="group" aria-label="View">
          <span className={`fd-cst${weekView ? "" : " is-day"}`} aria-hidden="true" />
          <button type="button" className={`fd-csb${weekView ? " is-on" : ""}`} aria-pressed={weekView} onClick={() => setView("week")}>Week</button>
          <button type="button" className={`fd-csb${weekView ? "" : " is-on"}`} aria-pressed={!weekView} onClick={() => setView("day")}>Day</button>
        </div>
      </div>

      <p className="fd-csyncl">
        <span className="fd-chip fd-csync is-plain"><Glyph name="check" size={13} strokeWidth={2.2} className="i-o" /><span className="fd-h">Read only</span></span>
        <span className="fd-csynct">Adding, moving and deleting stops is not available here yet. Times are in {week.timeZone}.</span>
        <button type="button" className="fd-btn fd-cadd" disabled title={NOT_YET}><Icon name="plus" size={15} strokeWidth={2.2} />Add estimate</button>
        <button type="button" className="fd-btn is-plain fd-cadd" disabled title={NOT_YET}><Icon name="plus" size={15} strokeWidth={2.2} />Add job</button>
      </p>
      {result.state === "ready" && (!result.complete || result.dropped > 0) ? (
        <p className="fd-cdl" role="status"><span>Some appointments may be missing from this week.</span></p>
      ) : null}
      {free ? <FreeTimesLine free={free} week={week} /> : null}
      {result.state === "empty" ? <div className="fd-none fx-none fd-in" role="status"><p>{emptyLine}</p></div> : null}

      <section className="fd-cbody fd-in" style={{ "--i": 2 } as CSSProperties} aria-label="The calendar">
        <div className="fd-cdays">
          <span className="fd-cgut" aria-hidden="true" />
          {week.days.map((d) => (
            <button
              key={d.index}
              type="button"
              className={`fd-cday${today === d.index ? " is-today" : ""}${day === d.index ? " is-on" : ""}${d.count ? " is-has" : ""}`}
              aria-pressed={day === d.index}
              aria-label={d.aria}
              onClick={() => { setDay(d.index); setView("day"); setSelId(null); }}
            >
              <span className="fd-cdn">{d.short}</span><span className="fd-cdd">{d.num}</span><span className="fd-cdot" aria-hidden="true" />
            </button>
          ))}
        </div>
        <p className="fd-ctitle" aria-live="polite"><b>{dayInfo.long}{today === day ? " · Today" : ""}</b><span>{summary(dayInfo.count)}</span></p>
        <div className="fd-cg">
          {HOURS.map((h, k) => <span key={h} className="fd-chr" style={{ "--r": 2 * k + 1, "--shown": 1 } as unknown as CSSProperties}>{h}</span>)}
          {[0, 1, 2, 3, 4, 5, 6].map((d) => <i key={d} className={`fd-ccol is-d${d}${today === d ? " is-today" : ""}`} />)}
          {nowLine ? <><i className="fd-now" style={nowStyle} aria-hidden="true" /><i className="fx-nowl" style={{ gridRow: nowLine.row }} aria-hidden="true">{nowLine.label}</i></> : null}
          {stops.map((stop) => (
            <LiveStopEvent key={stop.id} stop={stop} selected={selId === stop.id} laneStyle={laneStyle(stop)} onPick={() => setSelId((id) => (id === stop.id ? null : stop.id))} />
          ))}
          <div className={`fd-cempty${dayHasStops ? " is-off" : ""}`}><p>Nothing booked this day.</p></div>
          <LiveStopDetail stop={selected} week={week} onClose={() => setSelId(null)} />
        </div>
      </section>
    </div>
  );
}
