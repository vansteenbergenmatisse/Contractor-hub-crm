import type { CalendarWeekInfo, FreeSlot, LiveFreeTimes } from "../types";

const list = (slots: readonly FreeSlot[], week: CalendarWeekInfo) =>
  slots.map((slot) => `${week.days[slot.day].short} ${week.days[slot.day].num}, ${slot.label}`).join(" · ");

const MESSAGES = {
  "no-hours": "No free times shown: we could not read your business hours. Check them in Settings.",
  unsure: "No free times shown: some appointments could not be read.",
  none: "No free times left this week.",
} as const;

// What is free in the shown week. Information only: nothing can be booked from this line.
export function FreeTimesLine({ free, week }: { free: LiveFreeTimes; week: CalendarWeekInfo }) {
  if (free.state === "past") return null;
  if (free.state !== "open") return <p className="fd-cdl" role="status"><span>{MESSAGES[free.state]}</span></p>;
  return (
    <p className="fd-cdl" role="status">
      {free.visit.length ? <span>Free for a visit: {list(free.visit, week)}</span> : null}
      {free.visit.length && free.job.length ? " " : null}
      {free.job.length ? <span>Free for a job day: {list(free.job, week)}</span> : null}
    </p>
  );
}
