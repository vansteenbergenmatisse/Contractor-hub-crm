import type { CSSProperties } from "react";
import { useBusiness } from "@/features/app-shell";
import { joinParts } from "@/shared/lib/join-parts";
import { sourceRows } from "../api/leads-logic";
import { ChannelIcon } from "./ChannelIcon";

// Where this week's leads came from. Mock counts until Phase 3. The service area is the business's
// own city, county and state, as in the design; a missing part is left out, and the whole sentence
// when the sub-account has none. The county shows once the shell's business facts carry it
// (custom value business_main_county); until then it is skipped.
export function SourcesPanel({ nAdded, total }: { nAdded: number; total: number }) {
  const business = useBusiness();
  const county = "county" in business && typeof business.county === "string" ? business.county : "";
  const area = joinParts([business.city, county, business.state], ", ");
  return (
    <section className="fd-pnl" aria-labelledby="fd-ld-s">
      <h2 className="fd-pnh" id="fd-ld-s">Where your leads come from</h2>
      <p className="fd-pns">The {total} leads of this week.{area ? ` Service area: ${area}.` : ""}</p>
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
