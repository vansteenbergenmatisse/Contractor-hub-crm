import type { CSSProperties } from "react";

const rise = { "--i": 0 } as CSSProperties;

export function LeadsHeader() {
  return (
    <section className="fd-phd fd-in" style={rise}>
      <h1 className="fd-pt">Leads</h1>
      <p className="fd-pw">
        <span className="fd-wd">Every new lead and where it came from. Call the ones that wait. The system chases the rest.</span>
        <span className="fd-wm">Every new lead and where it came from.</span>
      </p>
    </section>
  );
}
