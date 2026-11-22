import type { CSSProperties } from "react";
import { MOCK_BUSINESS } from "@/shared/mock/business";
import { sourceRows } from "../api/leads-logic";
import { ChannelIcon } from "./ChannelIcon";

// Where this week's leads came from. Mock counts until Phase 3. The design also names the county;
// MOCK_BUSINESS has none, so the area is city and state.
export function SourcesPanel({ nAdded, total }: { nAdded: number; total: number }) {
  return (
    <section className="fd-pnl" aria-labelledby="fd-ld-s">
      <h2 className="fd-pnh" id="fd-ld-s">Where your leads come from</h2>
      <p className="fd-pns">The {total} leads of this week. Service area: {MOCK_BUSINESS.business_main_city}, {MOCK_BUSINESS.business_main_state_abbreviation}.</p>
      <ul className="fd-srcv">
        {sourceRows(nAdded).map((r) => (
          <li key={r.key}>
            <span className={`fd-src is-${r.key}`}><ChannelIcon name={r.key} size={13} />{r.label}</span>
            <span className="fd-srcb" aria-hidden="true"><i style={{ "--w": `${r.width}%` } as CSSProperties} /></span>
            <b>{r.count}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}
