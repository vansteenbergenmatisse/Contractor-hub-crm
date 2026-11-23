import type { CSSProperties } from "react";
import { CalendarHeader } from "./CalendarHeader";

const bar = (width: string, height = 12): CSSProperties => ({
  display: "block", width, height, borderRadius: 6, background: "currentColor", opacity: 0.1,
});

// Shown while the week loads: bars in place of any value.
export function CalendarSkeleton() {
  return (
    <div className="fd-cal">
      <CalendarHeader readOnly />
      <div className="fd-cbody fd-in" role="status" aria-busy="true" aria-label="Loading the calendar">
        <div aria-hidden="true" style={{ display: "grid", gap: 12, padding: 16 }}>
          <span style={bar("40%", 18)} />
          {[0, 1, 2, 3].map((n) => <span key={n} style={bar("100%", 44)} />)}
        </div>
      </div>
    </div>
  );
}
