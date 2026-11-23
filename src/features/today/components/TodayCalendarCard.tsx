import type { CSSProperties } from "react";
import type { CalendarResult } from "@/features/calendar";
import { stopWhen, todayCalendar } from "../api/today-calendar";
import { Glyph } from "./Glyph";

function Status({ bad, title, body }: { bad: boolean; title: string; body: string }) {
  return (
    <div className={`fd-none fx-none${bad ? " is-bad" : ""}`} role={bad ? "alert" : "status"}>
      <Glyph name={bad ? "alert" : "check"} size={20} />
      <p>{title}</p>
      <span>{body}</span>
    </div>
  );
}

// Today's real appointments, read-only. Null `result`: still loading.
export function TodayCalendarCard({ result }: { result: CalendarResult | null }) {
  const day = result ? todayCalendar(result) : null;
  const count = day?.proven ? `${day.stops.length} ${day.stops.length === 1 ? "appointment" : "appointments"}` : "";
  return (
    <section className="fd-card fd-in" style={{ "--i": 6 } as CSSProperties} aria-labelledby="fd-cal-h" aria-busy={result ? undefined : true}>
      <div className="fd-ch"><h2 className="fd-ct" id="fd-cal-h">Today’s calendar</h2>{count ? <span className="fd-cm">{count}</span> : null}</div>
      {result && !day ? (
        <Status bad title="Your calendar can't load right now." body="Nothing was changed. Open Calendar to try again." />
      ) : null}
      {day && day.stops.length === 0 ? (
        day.proven
          ? <Status bad={false} title="Nothing booked today." body="New appointments show up here." />
          : <Status bad title="Some appointments could not be read." body="Check your calendar in your CRM." />
      ) : null}
      {day && day.stops.length > 0 ? (
        <ol className="fd-stops">
          {day.stops.map((stop) => (
            <li key={stop.id} className={`fd-stop is-${stopWhen(day.stops, stop)}`}>
              <span className="fd-time">{stop.startLabel}</span>
              <span className="fd-node" aria-hidden="true" />
              <div className="fd-sx">
                <p className="fd-st"><b>{stop.name}</b></p>
                <p className="fd-ss">{[stop.statusLabel, stop.address].filter(Boolean).join(" · ")}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
