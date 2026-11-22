import { mapsUrl, visitChip } from "../api/selectors";
import type { Stop, TodayState } from "../types";
import { Chip } from "./Chip";
import { Glyph } from "./Glyph";

export function CalendarCard({ stops, state }: { stops: readonly Stop[]; state: TodayState }) {
  return (
    <section className="fd-card fd-in" style={{ "--i": 6 } as React.CSSProperties} aria-labelledby="fd-cal-h">
      <div className="fd-ch"><h2 className="fd-ct" id="fd-cal-h">Today’s calendar</h2><span className="fd-cm">{stops.length} appointments</span></div>
      <ol className="fd-stops">
        {stops.map((stop) => {
          const answer = visitChip(state, stop);
          return (
            <li key={stop.id} className={`fd-stop is-${stop.when}`}>
              <span className="fd-time">{stop.time}</span>
              <span className="fd-node" aria-hidden="true" />
              <div className="fd-sx">
                <p className="fd-st">
                  <b>{stop.name}</b>{" "}
                  {answer ? <Chip tone="plain" className={answer.className}>{answer.text}</Chip> : null}
                  {stop.nextChip ? <Chip tone="next" className="fd-chip is-next">{stop.nextChip}</Chip> : null}
                </p>
                <p className="fd-ss"><span className={`fd-kind is-${stop.kind}`}>{stop.kind === "job" ? "Job" : "Estimate"}</span> {stop.address}</p>
              </div>
              <a className="fd-link fd-dir" href={mapsUrl(stop.address)} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${stop.name}`}>
                <Glyph name="pin" size={17} strokeWidth={1.9} /><span className="fd-lg">Directions</span>
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
