import type { CSSProperties } from "react";
import { LeadsHeader } from "./LeadsHeader";

const bar = (width: string, height = 12): CSSProperties => ({
  display: "block", width, height, borderRadius: 6, background: "currentColor", opacity: 0.1,
});

// Shown while the leads load: the page's own tiles and rows, with bars in place of any value.
export function LeadsSkeleton() {
  return (
    <>
      <LeadsHeader />
      <div className="fd-cols fd-in" role="status" aria-busy="true" aria-label="Loading leads">
        <div>
          <section className="fd-sum fd-sumc" aria-hidden="true">
            {[0, 1, 2].map((n) => <div className="fd-smt" key={n}><span style={bar("40%", 22)} /><span style={{ ...bar("70%"), marginTop: 8 }} /></div>)}
          </section>
          <div className="fd-lst" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((n) => (
              <div className="fd-rw" key={n}>
                <div className="fd-rm">
                  <span className="fd-cht" style={{ opacity: 0.15 }} />
                  <div className="fd-rbx"><span style={bar("45%", 14)} /><span style={{ ...bar("70%"), marginTop: 8 }} /></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
