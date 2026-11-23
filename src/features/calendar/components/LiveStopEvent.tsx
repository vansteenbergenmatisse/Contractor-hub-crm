import type { CSSProperties } from "react";
import { Icon } from "@/features/app-shell";
import type { LiveStop } from "../types";
import { Glyph } from "./Glyph";

// One real appointment in the grid. HighLevel does not say which are estimates or jobs, so each reads
// "Appointment". Overlapping stops share the column on the computer week grid (`laneStyle`).
export function LiveStopEvent({ stop, selected, laneStyle, onPick }: { stop: LiveStop; selected: boolean; laneStyle?: CSSProperties; onPick: () => void }) {
  const cls = `fd-ev is-E is-d${stop.day} is-t${stop.start} is-l${stop.len}${stop.past ? " is-past" : ""}${selected ? " is-sel" : ""}`;
  return (
    <button type="button" className={cls} style={laneStyle} aria-pressed={selected} onClick={onPick}>
      <span className="fd-et1">{stop.startLabel} · Appointment</span>
      <span className="fd-et2"><b>{stop.startLabel}</b><i>to {stop.endLabel}</i></span>
      <span className="fd-ekt"><span className="fd-kind is-estimate">Appointment</span></span>
      <span className="fd-enm">{stop.name}</span>
      <span className="fd-esv">{stop.service}</span>
      {stop.address ? <span className="fd-ead"><Glyph name="pin" size={14} />{stop.address}</span> : null}
      <span className="fd-ech" aria-hidden="true"><Icon name="right" size={18} strokeWidth={2.2} /></span>
    </button>
  );
}
