import type { CSSProperties } from "react";
import { LivePipelineHeader } from "./LivePipelineHeader";

const bar = (width: string, height = 12): CSSProperties => ({
  display: "block", width, height, borderRadius: 6, background: "currentColor", opacity: 0.1,
});

// Shown while the board loads: the page's own stage strip, with bars in place of any value.
export function LivePipelineSkeleton() {
  return (
    <div className="fd-kb is-g0 is-st0">
      <LivePipelineHeader />
      <div className="fd-smapw fd-in" role="status" aria-busy="true" aria-label="Loading pipeline">
        <div className="fd-smap" aria-hidden="true">
          {[0, 1, 2, 3].map((n) => (
            <div className="fd-sg" key={n} style={{ padding: 12 }}>
              <span style={bar("40%", 22)} />
              <span style={{ ...bar("70%"), marginTop: 8 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
