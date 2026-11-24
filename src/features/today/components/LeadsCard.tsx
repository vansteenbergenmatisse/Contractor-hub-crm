"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { PAGE_PATH } from "@/features/app-shell";
import { joinParts } from "@/shared/lib/join-parts";
import type { LeadsResult } from "@/features/leads";
import { initials, leadPanes } from "../api/lead-panes";
import type { LeadRange } from "../types";
import { LeadsCardStatus } from "./LeadsCardStatus";
import { NotAvailableChip } from "./NotAvailableChip";

const RANGES: ReadonlyArray<readonly [LeadRange, string]> = [["today", "Today"], ["week", "This week"]];
const bar = (width: string): CSSProperties => ({ display: "block", width, height: 12, borderRadius: 6, background: "currentColor", opacity: 0.1 });

// Both lists stay in the page; the CSS fades the one that is off (class is-off), as in the design.
// Real contacts: the received time, no waiting chip and no button. Null `result`: still loading.
export function LeadsCard({ result, range, onRange, timeZone, index = 5 }: {
  result: LeadsResult | null;
  range: LeadRange;
  onRange: (range: LeadRange) => void;
  timeZone: string;
  index?: number;
}) {
  const panes = result?.state === "ready" ? leadPanes(result, timeZone) : null;
  return (
    <section className="fd-card fd-in" style={{ "--i": index } as CSSProperties} aria-labelledby="fd-lead-h">
      <div className="fd-ch">
        <h2 className="fd-ct" id="fd-lead-h">New leads</h2>
        {panes ? (
          <div className="fd-seg" role="group" aria-label="Show leads from">
            <span className={`fd-thumb${range === "today" ? "" : " is-week"}`} aria-hidden="true" />
            {RANGES.map(([key, label]) => (
              <button key={key} type="button" className={`fd-sb${range === key ? " is-on" : ""}`} aria-pressed={range === key} onClick={() => onRange(key)}>{label}</button>
            ))}
          </div>
        ) : null}
      </div>
      {!result ? (
        <ul className="fd-leads" role="status" aria-busy="true" aria-label="Loading leads">
          {[0, 1, 2].map((n) => <li key={n} className="fd-lead"><span className="fd-av" aria-hidden="true" /><div className="fd-lx"><span style={bar("55%")} /></div></li>)}
        </ul>
      ) : !panes ? (
        <LeadsCardStatus state={result.state as "empty" | "reconnect" | "unavailable"} />
      ) : (
        <div className="fd-panes">
          {RANGES.map(([key]) => {
            const { rows, count } = panes[key];
            return (
              <div key={key} className={`fd-pane${range === key ? "" : " is-off"}`}>
                {count !== null ? <p className="fd-big"><b>{count}</b> {key === "today" ? "new today" : "this week"}</p>
                  : rows.length === 0 ? <p className="fd-big"><NotAvailableChip /></p> : <p className="fd-pns">Some leads may be missing from this list.</p>}
                <ul className="fd-leads">
                  {rows.map((lead) => (
                    <li key={lead.id}>
                      <Link className="fd-lead" href={`${PAGE_PATH.leads}?row=${encodeURIComponent(lead.id)}`} prefetch={false}>
                        <span className="fd-av" aria-hidden="true">{initials(lead.name)}</span>
                        <div className="fd-lx"><p className="fd-lt"><b>{lead.name}</b></p><p className="fd-ls">{joinParts([lead.need, lead.received])}</p></div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
