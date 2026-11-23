import { Icon } from "@/features/app-shell";
import type { CalendarWeekInfo, LiveStop } from "../types";
import { Glyph } from "./Glyph";

const NOT_YET = "Not available here yet";

// The panel for the appointment you pressed. Read-only: Reschedule and Delete are off and say so.
export function LiveStopDetail({ stop, week, onClose }: { stop: LiveStop | null; week: CalendarWeekInfo; onClose: () => void }) {
  const cls = `fd-cdet${stop ? ` is-on is-o${stop.start}${stop.day >= 4 ? " is-left" : ""}` : " is-off"}`;
  return (
    <aside className={cls} aria-label="The stop you pressed" aria-live="polite">
      {stop ? (
        <>
          <div className="fd-dh">
            <span className="fd-kind is-estimate">Appointment</span>
            <button type="button" className="fd-ibtn fd-dx" aria-label="Close" onClick={onClose}><Icon name="close" size={18} strokeWidth={2} /></button>
          </div>
          <h3 className="fd-dn">{stop.name}</h3>
          {stop.service ? <p className="fd-ds">{stop.service}</p> : null}
          <p className="fd-dl fd-dl2"><Glyph name="clock" /><span>{week.days[stop.day].long} · {stop.startLabel} to {stop.endLabel}</span></p>
          {stop.address ? <p className="fd-dl fd-dl2"><Glyph name="pin" /><span>{stop.address}</span></p> : null}
          {stop.statusLabel ? <p className="fd-dl"><Glyph name="bolt" /><span>{stop.statusLabel}</span></p> : null}
          <button type="button" className="fd-btn fd-drs" disabled title={NOT_YET}><Glyph name="swap" />Reschedule</button>
          <button type="button" className="fd-btn is-danger fd-ddel" disabled title={NOT_YET}><Glyph name="trash" /><span>Delete</span></button>
          <p className="fd-ds">Moving and deleting stops is not available here yet.</p>
        </>
      ) : null}
    </aside>
  );
}
