"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { PAGE_PATH } from "@/features/app-shell";
import type { LeadsResult } from "@/features/leads";
import { leadCounts } from "../api/lead-panes";
import { useTimeZone } from "../hooks/use-time-zone";
import { NotAvailableCard } from "./NotAvailableCard";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function newLeads(result: LeadsResult, timeZone: string): number | null {
  if (result.state === "empty") return 0;
  return result.state === "ready" ? leadCounts(result, timeZone).today : null;
}

// Shown while the reads run, so a slow load never says "Not available yet".
export function TodayNeedsLoading() {
  return (
    <section className="fd-card fd-need fd-in" style={{ "--i": 7 } as CSSProperties} aria-labelledby="fd-need-h" aria-busy="true">
      <div className="fd-ch"><h2 className="fd-ct" id="fd-need-h">Needs you</h2></div>
    </section>
  );
}

// What needs the owner, as links to the page that holds it. Read-only: no row sends or changes
// anything. A source that could not be read is named, so a short list never reads as "all clear".
export function TodayNeedsCard({ leads, toSend, timeZone: locationZone }: { leads: LeadsResult; toSend: number | null; timeZone?: string | null }) {
  const viewerZone = useTimeZone();
  const fresh = newLeads(leads, locationZone ?? viewerZone);
  if (fresh === null && toSend === null) return <NotAvailableCard id="fd-need-h" title="Needs you" index={7} className="fd-need" />;
  const rows = [
    fresh ? { href: PAGE_PATH.leads, text: `${plural(fresh, "new lead", "new leads")} today` } : null,
    toSend ? { href: PAGE_PATH.invoices, text: `${plural(toSend, "invoice", "invoices")} to send` } : null,
  ].filter((row) => row !== null);
  const missing = [fresh === null ? "Leads" : null, toSend === null ? "Invoices" : null].filter(Boolean);
  return (
    <section className="fd-card fd-need fd-in" style={{ "--i": 7 } as CSSProperties} aria-labelledby="fd-need-h">
      <div className="fd-ch"><h2 className="fd-ct" id="fd-need-h">Needs you</h2></div>
      {rows.length ? (
        <ul className="fd-rows">
          {rows.map((row) => <li key={row.href} className="fd-row fd-nr"><Link className="fd-nl" href={row.href}><div className="fd-rx"><p className="fd-rt">{row.text}</p></div></Link></li>)}
        </ul>
      ) : null}
      {!rows.length && !missing.length ? <div className="fd-none fx-none" role="status"><p>Nothing needs you right now.</p></div> : null}
      {missing.length ? <p className="fd-mf" role="status">{missing.join(" and ")} could not be checked.</p> : null}
    </section>
  );
}
