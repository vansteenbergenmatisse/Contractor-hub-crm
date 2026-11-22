"use client";

import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { PAGE_PATH, PageAction } from "@/features/app-shell";
import { filterCounts, firstNeedId, summarize, tiles, visibleAdded, visibleLeads } from "../api/leads-logic";
import { useLeads, useOpenAddFromUrl } from "../hooks/use-leads";
import { MOCK_LEADS } from "../mock";
import { AddLeadPanel } from "./AddLeadPanel";
import { AddedLeadRow } from "./AddedLeadRow";
import { ChannelIcon } from "./ChannelIcon";
import { FilterControl } from "./FilterControl";
import { LeadRow } from "./LeadRow";
import { OldLeadsPanel } from "./OldLeadsPanel";
import { SourcesPanel } from "./SourcesPanel";
import { WaitSummary } from "./WaitSummary";

const rise = (i: number) => ({ "--i": i }) as CSSProperties;

// Page content only. The shell adds the .fd-view wrapper. Phase 2: every button changes local mock
// state. Nothing is fetched or sent, and the app holds no automation of its own.
export function LeadsPage() {
  const [state, dispatch] = useLeads();
  const router = useRouter();
  useOpenAddFromUrl(dispatch);

  const counts = filterCounts(MOCK_LEADS, state);
  const summary = summarize(MOCK_LEADS, state);
  const t = tiles(MOCK_LEADS, state);
  const rows = visibleLeads(MOCK_LEADS, state);
  const added = visibleAdded(state);
  const mainId = firstNeedId(MOCK_LEADS, state);
  const openInbox = () => router.push(PAGE_PATH.inbox);

  const go = () => {
    if (!summary.target) return;
    if (summary.target.kind === "reply") openInbox();
    else dispatch({ type: "call", id: summary.target.id });
  };

  return (
    <>
      {!state.sheet && (
        <PageAction>
          <button type="button" className="fd-btn fx-accb" onClick={() => dispatch({ type: "openAdd" })}>
            <ChannelIcon name="plus" size={16} strokeWidth={2.2} />Add a lead
          </button>
        </PageAction>
      )}
      <section className="fd-phd fd-in" style={rise(0)}>
        <h1 className="fd-pt">Leads</h1>
        <p className="fd-pw">
          <span className="fd-wd">Every new lead and where it came from. Call the ones that wait. The system chases the rest.</span>
          <span className="fd-wm">Every new lead and where it came from.</span>
        </p>
      </section>
      <div className="fd-cols fd-in" style={rise(1)}>
        <div>
          <section className="fd-sum fd-sumc" aria-label="In numbers">
            <div className="fd-smt"><p className="fd-smv">{t.today}</p><p className="fd-sml">New today</p></div>
            <div className="fd-smt"><p className="fd-smv">{t.week}</p><p className="fd-sml">This week</p></div>
            <div className="fd-smt"><p className="fd-smv">{t.wait}</p><p className="fd-sml">Wait on you</p></div>
          </section>
          <div className="fd-flr">
            <FilterControl value={state.filter} counts={counts} onChange={(filter) => dispatch({ type: "filter", filter })} />
            <button type="button" className="fd-btn is-plain fd-addb" onClick={() => dispatch({ type: "openAdd" })}>
              <ChannelIcon name="plus" size={16} strokeWidth={2.2} />Add a lead
            </button>
          </div>
          <WaitSummary summary={summary} onGo={go} />
          {rows.length + added.length === 0 && (
            <div className="fd-none fx-none">
              <ChannelIcon name="check" size={20} />
              <p>Nobody waits this long.</p>
              <button type="button" className="fd-btn is-plain" onClick={() => dispatch({ type: "filter", filter: "all" })}>Show all leads</button>
            </div>
          )}
          <div className="fd-lst">
            {added.map((a) => <AddedLeadRow key={a.id} lead={a} />)}
            {rows.map((l) => (
              <LeadRow
                key={l.id}
                lead={l}
                status={state.status[l.id]}
                main={l.id === mainId}
                onCall={() => dispatch({ type: "call", id: l.id })}
                onReply={openInbox}
                onBook={() => dispatch({ type: "book", id: l.id })}
              />
            ))}
          </div>
        </div>
        <div className="fd-side2">
          <OldLeadsPanel
            old={state.old}
            auto={state.auto}
            onAsk={() => dispatch({ type: "old", to: "ask" })}
            onYes={() => dispatch({ type: "old", to: "sent" })}
            onNo={() => dispatch({ type: "old", to: "idle" })}
            onToggleAuto={() => dispatch({ type: "toggleAuto" })}
          />
          <AddLeadPanel
            sheet={state.sheet}
            form={state.form}
            errors={state.errors}
            focus={state.focus}
            onField={(field, value) => dispatch({ type: "field", field, value })}
            onSubmit={() => dispatch({ type: "submit" })}
            onClose={() => dispatch({ type: "closeAdd" })}
          />
          <SourcesPanel nAdded={state.added.length} total={t.week} />
        </div>
      </div>
    </>
  );
}
