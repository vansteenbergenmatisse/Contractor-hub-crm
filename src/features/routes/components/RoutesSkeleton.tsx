import type { CSSProperties } from "react";
import { RoutesHeader } from "./RoutesHeader";

const bar = (width: string, height = 12): CSSProperties => ({
  display: "block", width, height, borderRadius: 6, background: "currentColor", opacity: 0.1,
});

// Shown while today's jobs load: bars in place of any value.
export function RoutesSkeleton() {
  return (
    <div className="fd-cal">
      <RoutesHeader />
      <div className="fd-card fd-in" role="status" aria-busy="true" aria-label="Loading your jobs">
        <div aria-hidden="true" style={{ display: "grid", gap: 12, padding: 16 }}>
          <span style={bar("40%", 18)} />
          {[0, 1, 2].map((n) => <span key={n} style={bar("100%", 44)} />)}
        </div>
      </div>
    </div>
  );
}
