"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { PAGE_PATH, PageAction, useRowFocus, useSearchRows } from "@/features/app-shell";
import {
  addLeadMode, filterCounts, firstNeedId, hasWaitData, summarize, tiles, visibleAdded, visibleLeads, weekKnown, withReceived,
} from "../api/leads-logic";
import { liveSearchRows } from "../api/search-rows";
import { isPhoneNow, useIsPhone } from "../hooks/use-is-phone";
import { useLeads, useOpenAddFromUrl, useRevealLead } from "../hooks/use-leads";
import { DEFAULT_ORIGIN, ORIGIN_LABEL } from "../api/lead-sources";
import { useTimeZone } from "../hooks/use-time-zone";
import type { Lead, LeadOrigin } from "../types";
import { AddLeadPanel } from "./AddLeadPanel";
import { AddedLeadRow } from "./AddedLeadRow";
import { ChannelIcon } from "./ChannelIcon";
import { FilterControl } from "./FilterControl";
import { LeadRow } from "./LeadRow";
import { LeadsHeader } from "./LeadsHeader";
import { SourcesPanel } from "./SourcesPanel";
import { WaitSummary } from "./WaitSummary";

const rise = (i: number) => ({ "--i": i }) as CSSProperties;

type Props = { leads: readonly Lead[]; loadedAt: string; complete: boolean; dropped: number; locationZone?: string | null };

// The list of real leads. Read-only toward the CRM: nothing here sends or saves. A hand-added lead
// stays on this screen; call, reply and booking buttons are off on real contacts.
export function LeadsReady({ leads: loaded, loadedAt, complete, dropped, locationZone }: Props) {
  const viewerZone = useTimeZone();
  const timeZone = locationZone ?? viewerZone;
  const leads = useMemo(() => withReceived(loaded, loadedAt, timeZone), [loaded, loadedAt, timeZone]);
  const [kept, dispatch] = useLeads(leads);
  const router = useRouter();
  const phone = useIsPhone();
  // Computer: each press of "Add a lead" scrolls to the side form and puts the cursor in it.
  const [focusTick, setFocusTick] = useState(0);
  const openAdd = useCallback(() => {
    if (addLeadMode(isPhoneNow()) === "sheet") dispatch({ type: "openAdd" });
    else setFocusTick((n) => n + 1);
  }, [dispatch]);
  useOpenAddFromUrl(openAdd);
  const [origin, setOrigin] = useState<LeadOrigin>(DEFAULT_ORIGIN);

  // Phone: when the sheet closes, the cursor goes back to the "Add a lead" button in the action bar.
  // That button is mounted again by the shell after the sheet closes, so its ref takes the focus.
  // When the button is already back by the time the sheet's close is seen, it takes the focus at once.
  const wasSheet = useRef(false);
  const returnFocus = useRef(false);
  const addButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (wasSheet.current && !kept.sheet) {
      if (addButton.current?.isConnected) addButton.current.focus();
      else returnFocus.current = true;
    }
    wasSheet.current = kept.sheet;
  }, [kept.sheet]);
  const addButtonRef = useCallback((el: HTMLButtonElement | null) => {
    addButton.current = el;
    if (el && returnFocus.current) {
      returnFocus.current = false;
      el.focus();
    }
  }, []);

  // Without wait data the wait filter has nothing to sort by, so it is off and shows everyone.
  const waitData = hasWaitData(leads);
  const state = waitData ? kept : { ...kept, filter: "all" as const };
  const counts = filterCounts(leads, state);
  const summary = summarize(leads, state);
  const t = tiles(leads, state, { loadedAt, complete, timeZone, dropped });
  const shownTiles = [
    { label: "New today", value: t.today },
    { label: "This week", value: t.week },
    { label: "Wait on you", value: t.wait },
  ].filter((tile) => tile.value !== null);
  const rows = visibleLeads(leads, state);
  const added = visibleAdded(state);
  const mainId = firstNeedId(leads, state);
  const openInbox = () => router.push(PAGE_PATH.inbox);
  // Closing the sheet keeps what was typed, so the button says a lead is waiting to be finished.
  const hasDraft = Object.values(state.form).some((v) => v.trim() !== "");
  // A search result opens /leads?row=<lead id>: show all leads when the filter hides that lead,
  // then the shell's useRowFocus brings the row into view (it only gets the rows on screen).
  const shownIds = [...added.map((a) => a.id), ...rows.map((l) => l.id)];
  useRevealLead(shownIds, [...state.added.map((a) => a.id), ...leads.map((l) => l.id)], dispatch);
  useRowFocus(shownIds);
  // Search finds the loaded leads and the hand-added ones.
  const found = useMemo(() => liveSearchRows(kept.added, leads), [kept.added, leads]);
  useSearchRows("leads", found);

  const go = () => {
    if (!summary.target) return;
    if (summary.target.kind === "reply") openInbox();
    else dispatch({ type: "call", id: summary.target.id });
  };

  return (
    <>
      {!state.sheet && (
        <PageAction>
          <button ref={addButtonRef} type="button" className="fd-btn fx-accb" onClick={openAdd}>
            <ChannelIcon name="plus" size={16} strokeWidth={2.2} />{hasDraft ? "Finish lead" : "Add a lead"}
          </button>
        </PageAction>
      )}
      <LeadsHeader />
      <div className="fd-cols fd-in" style={rise(1)}>
        <div>
          {shownTiles.length > 0 && (
            <section
              className="fd-sum fd-sumc"
              aria-label="In numbers"
              style={shownTiles.length < 3 ? { gridTemplateColumns: `repeat(${shownTiles.length}, minmax(0, 1fr))` } : undefined}
            >
              {shownTiles.map((tile) => (
                <div className="fd-smt" key={tile.label}><p className="fd-smv">{tile.value}</p><p className="fd-sml">{tile.label}</p></div>
              ))}
            </section>
          )}
          <div className="fd-flr">
            {waitData && <FilterControl value={state.filter} counts={counts} onChange={(filter) => dispatch({ type: "filter", filter })} />}
            <button type="button" className="fd-btn is-plain fd-addb" onClick={openAdd}>
              <ChannelIcon name="plus" size={16} strokeWidth={2.2} />Add a lead
            </button>
          </div>
          {(waitData || state.added.length > 0) && <WaitSummary summary={summary} onGo={go} />}
          {rows.length + added.length === 0 && (
            <div className="fd-none fx-none">
              <ChannelIcon name="check" size={20} />
              <p>Nobody waits this long.</p>
              <button type="button" className="fd-btn is-plain" onClick={() => dispatch({ type: "filter", filter: "all" })}>Show all leads</button>
            </div>
          )}
          {rows.some((l) => (state.status[l.id] ?? l.status) === "new") && (
            <p className="fd-pns">Calling and booking from this list are not available yet.</p>
          )}
          {rows.length + added.length > 0 && (
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
          )}
          {!complete && <p className="fd-pns">Showing your newest {leads.length === 1 ? "lead" : `${leads.length} leads`}.</p>}
          {dropped > 0 && <p className="fd-pns">{dropped === 1 ? "1 lead" : `${dropped} leads`} could not be shown.</p>}
        </div>
        <div className="fd-side2">
          {weekKnown(leads, loadedAt, complete, dropped, timeZone) && <SourcesPanel nAdded={state.nAdd} leads={leads} loadedAt={loadedAt} timeZone={timeZone} complete={complete} dropped={dropped} />}
          <AddLeadPanel
            sheet={state.sheet}
            phone={phone}
            focusTick={focusTick}
            form={state.form}
            errors={state.errors}
            focus={state.focus}
            onField={(field, value) => dispatch({ type: "field", field, value })}
            onSubmit={() => dispatch({ type: "submit", origin: origin === "you" ? undefined : ORIGIN_LABEL[origin] })}
            onClose={() => dispatch({ type: "closeAdd" })}
            origin={origin}
            onOrigin={setOrigin}
          />
        </div>
      </div>
    </>
  );
}
