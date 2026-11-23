import type { CSSProperties } from "react";
import { InboxHeader } from "./InboxHeader";

const bar = (width: string, height = 12): CSSProperties => ({
  display: "block", width, height, borderRadius: 6, background: "currentColor", opacity: 0.1,
});

// Shown while the inbox loads: the page's own rows, with bars in place of any value.
export function InboxSkeleton() {
  return (
    <div className="fd-ix">
      <InboxHeader />
      <div className="fd-ixg fd-in" role="status" aria-busy="true" aria-label="Loading conversations" style={{ "--i": 1 } as CSSProperties}>
        <section className="fd-il" aria-hidden="true">
          <div className="fd-crs">
            {[0, 1, 2, 3, 4].map((n) => (
              <div className="fd-cr" key={n}>
                <span className="fd-cht" style={{ opacity: 0.15 }} />
                <span className="fd-crx"><span style={bar("45%", 14)} /><span style={{ ...bar("70%"), marginTop: 8 }} /></span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
