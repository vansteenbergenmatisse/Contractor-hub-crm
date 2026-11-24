"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useBusiness } from "@/features/app-shell";
import { joinParts } from "@/shared/lib/join-parts";
import { sourceBreakdown } from "../api/lead-sources";
import type { Lead, LeadOrigin, SourcePeriod } from "../types";
import { ChannelIcon } from "./ChannelIcon";

const PERIODS: ReadonlyArray<{ key: SourcePeriod; label: string }> = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
];
const PHRASE: Record<Exclude<SourcePeriod, "all">, string> = { today: "of today", week: "of this week", month: "of this month" };

const ON: CSSProperties = { background: "var(--main-background-color)", color: "var(--main-hover-color)" };

type Props = { nAdded: number; addedBy?: Partial<Record<LeadOrigin, number>>; leads: readonly Lead[]; loadedAt: string; timeZone: string; complete: boolean; dropped: number };

// Where leads came from, counted from real rows in the location's time zone. A value that is not an
// exact channel stays Unknown. When contacts beyond the loaded page could count, it says so.
export function SourcesPanel({ nAdded, addedBy, leads, loadedAt, timeZone, complete, dropped }: Props) {
  const business = useBusiness();
  const [period, setPeriod] = useState<SourcePeriod>("week");
  const county = "county" in business && typeof business.county === "string" ? business.county : "";
  const area = joinParts([business.city, county, business.state], ", ");
  // Date formatting is slow; typing in the form beside this panel must not redo it on every key.
  const data = useMemo(
    () => sourceBreakdown(leads, addedBy ?? nAdded, period, { loadedAt, timeZone, complete, dropped }),
    [leads, nAdded, addedBy, period, loadedAt, timeZone, complete, dropped],
  );
  const unknown = data.rows.find((r) => r.key === "unknown")?.count ?? 0;
  const unlabelled = unknown ? ` ${unknown} ${unknown === 1 ? "has" : "have"} no clear source.` : "";
  const head = !data.proven
    ? `From your newest ${data.loaded === 1 ? "lead" : `${data.loaded} leads`}. There may be more.`
    : period === "all" ? `All ${data.total} leads.` : `The ${data.total} leads ${PHRASE[period]}.`;
  return (
    <section className="fd-pnl" aria-labelledby="fd-ld-s">
      <h2 className="fd-pnh" id="fd-ld-s">Where your leads come from</h2>
      <div role="group" aria-label="Period" style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: "8px 0" }}>
        {PERIODS.map((p) => (
          <button key={p.key} type="button" className="fd-btn is-plain" style={period === p.key ? ON : undefined} aria-pressed={period === p.key} onClick={() => setPeriod(p.key)}>
            {p.label.split(" ").map((word, i) => <span key={word}>{i ? " " : ""}{word}</span>)}
          </button>
        ))}
      </div>
      <p className="fd-pns">{head}{unlabelled}{area ? ` Service area: ${area}.` : ""}</p>
      <ul className="fd-srcv">
        {data.rows.map((r) => (
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
