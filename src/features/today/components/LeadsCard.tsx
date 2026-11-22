import { leadMeta, leadsFor } from "../api/selectors";
import type { LeadRange } from "../types";
import { Chip } from "./Chip";

const RANGES: ReadonlyArray<readonly [LeadRange, string]> = [["today", "Today"], ["week", "This week"]];

// Both lists stay in the page; the CSS fades the one that is off (class is-off), as in the design.
export function LeadsCard({ range, onRange }: { range: LeadRange; onRange: (range: LeadRange) => void }) {
  return (
    <section className="fd-card fd-in" style={{ "--i": 7 } as React.CSSProperties} aria-labelledby="fd-lead-h">
      <div className="fd-ch">
        <h2 className="fd-ct" id="fd-lead-h">New leads</h2>
        <div className="fd-seg" role="group" aria-label="Show leads from">
          <span className={`fd-thumb${range === "today" ? "" : " is-week"}`} aria-hidden="true" />
          {RANGES.map(([key, label]) => (
            <button key={key} type="button" className={`fd-sb${range === key ? " is-on" : ""}`} aria-pressed={range === key} onClick={() => onRange(key)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="fd-panes">
        {RANGES.map(([key]) => {
          const leads = leadsFor(key);
          return (
            <div key={key} className={`fd-pane${range === key ? "" : " is-off"}`}>
              <p className="fd-big"><b>{leads.length}</b> {key === "today" ? "new today" : "this week"}</p>
              <ul className="fd-leads">
                {leads.map((lead) => (
                  <li key={lead.name} className="fd-lead">
                    <span className="fd-av" aria-hidden="true">{lead.init}</span>
                    <div className="fd-lx"><p className="fd-lt"><b>{lead.name}</b></p><p className="fd-ls">{leadMeta(lead, key)}</p></div>
                    <Chip tone={lead.chip.tone} icon={lead.chip.tone === "warn" ? "clock" : lead.chip.tone === "ok" ? "check" : undefined}>{lead.chip.text}</Chip>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
