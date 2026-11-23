import type { CSSProperties } from "react";

const bar = (width: string, height = 12): CSSProperties => ({
  display: "block", width, height, borderRadius: 6, background: "currentColor", opacity: 0.1,
});

// Shown while Automations loads: bars in place of any value.
export function AutomationsSkeleton() {
  return (
    <div className="fd-au">
      <section className="fd-phd fd-in"><h1 className="fd-pt">Automations</h1></section>
      <div className="fd-in" role="status" aria-busy="true" aria-label="Loading automations">
        <div aria-hidden="true" style={{ display: "grid", gap: 12, padding: 16 }}>
          <span style={bar("40%", 18)} />
          {[0, 1, 2, 3].map((n) => <span key={n} style={bar("100%", 44)} />)}
        </div>
      </div>
    </div>
  );
}
