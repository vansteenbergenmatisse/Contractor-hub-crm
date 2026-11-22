import { Icon } from "@/features/app-shell";

// The phone action bar above the tab bar: week arrows, Today, Estimate, Job. The shell shows it
// only on a phone. Estimate is the one filled button.
export function CalendarActions({ onPrevWeek, onNextWeek, onToday, onAddEstimate, onAddJob }: {
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onAddEstimate: () => void;
  onAddJob: () => void;
}) {
  return (
    <span className="fx-accg">
      <button type="button" className="fd-ibtn" aria-label="The week before" onClick={onPrevWeek}><Icon name="left" size={20} strokeWidth={2} /></button>
      <button type="button" className="fd-btn is-plain" aria-label="Go to today's week" onClick={onToday}>Today</button>
      <button type="button" className="fd-ibtn" aria-label="The week after" onClick={onNextWeek}><Icon name="right" size={20} strokeWidth={2} /></button>
      <button type="button" className="fd-btn" onClick={onAddEstimate}><Icon name="plus" size={16} strokeWidth={2} /><span>Estimate</span></button>
      <button type="button" className="fd-btn is-plain" onClick={onAddJob}><Icon name="plus" size={16} strokeWidth={2} /><span>Job</span></button>
    </span>
  );
}
