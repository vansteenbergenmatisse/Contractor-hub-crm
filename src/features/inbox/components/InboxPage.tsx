"use client";

import { useEffect, useRef, useState } from "react";
import { useBusiness, useBusinessValues, usePushed, useRowFocus } from "@/features/app-shell";
import { conversationOfRow, deliveryLabel, doneLabel, filterCounts, isVisible, replyLabel, rowIdOf, rowSnippet, rowTime, summarize, visibleCount } from "../api/state";
import { bookingLinkOf, fillText } from "../api/text";
import { waitLabel, waitLevelClass } from "../api/wait";
import { useInbox } from "../hooks/use-inbox";
import { MOCK_CONVERSATIONS, MOCK_QUICK_REPLIES } from "../mock";
import type { TextBusiness } from "../types";
import { ConversationRow } from "./ConversationRow";
import { FilterBar } from "./FilterBar";
import { ThreadBody } from "./ThreadBody";
import { WaitSummary } from "./WaitSummary";

// The Inbox page content. The shell adds the page wrapper, the top bar and the tab bar.
// Everything here changes local state only: nothing is sent, fetched or saved.
// `row` is the shell search's `?row=<id>`: that conversation opens (see `InboxPageFromUrl`).
export function InboxPage({ row = null }: { row?: string | null } = {}) {
  const biz = useBusiness();
  const values = useBusinessValues();
  // The business's own facts for the sample texts. "" when the sub-account has no value.
  const BUSINESS: TextBusiness = {
    name: values.business_name,
    first: values.business_owner_name.split(/\s+/)[0] ?? "",
    site: biz.site,
    bookingLink: bookingLinkOf(biz.bookingJobUrl, biz.site),
  };
  const quickReplies = MOCK_QUICK_REPLIES.filter((q) => BUSINESS.bookingLink || !q.text.includes("{booking link}"));
  const conversations = MOCK_CONVERSATIONS;
  const { state, dispatch } = useInbox(conversations);
  usePushed(state.open);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  // Where focus goes after the next render: the reply box (opened from the keyboard) or the open row
  // (Escape on a phone took the owner back to the list).
  const focusNext = useRef<"" | "composer" | "row">("");

  const current = conversations.find((c) => c.id === state.selected) ?? conversations[0];
  const needs = !!state.needs[current.id];
  const sent = state.sent[current.id] ?? [];
  const counts = filterCounts(state, conversations);
  const summary = summarize(state, conversations);
  const delivery = deliveryLabel(state, current);
  const fresh = state.event === "send" ? (state.bumps % 2 ? "a" : "b") : "";

  // A conversation opens at its newest message; the list opens at its top. As in the design only
  // opening, sending and going back to the list scroll: Mark done and the filters leave it alone.
  const { event, open: isOpen, swaps, bumps } = state;
  useEffect(() => {
    if (event === "done" || event === "flt") return;
    const thread = threadRef.current;
    const main = thread?.closest("main");
    if (thread) thread.scrollTop = isOpen ? thread.scrollHeight : 0;
    if (main && main.scrollHeight > main.clientHeight + 1) main.scrollTop = isOpen ? main.scrollHeight : 0;
  }, [event, isOpen, swaps, bumps]);

  // Focus moves only after the render that shows its target (on a phone the reply box and the list
  // are hidden until then).
  useEffect(() => {
    const target = focusNext.current;
    focusNext.current = "";
    if (target === "composer") inputRef.current?.focus({ preventScroll: true });
    if (target === "row") rowsRef.current?.querySelector<HTMLElement>('.fd-cr[aria-current="true"]')?.focus();
  }, [state.open, state.selected, state.swaps]);

  // Escape on a phone closes the open conversation (the design's uxEsc), unless a dialog, the menu
  // drawer or the feedback box is open: those close first.
  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || window.innerWidth >= 1024) return;
      if (document.querySelector('[aria-modal="true"], .fd-side.is-open, .fd-fb.is-open')) return;
      e.preventDefault();
      focusNext.current = "row";
      dispatch({ type: "toList" });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state.open, dispatch]);

  // A search result opens its conversation, also when the Inbox is already on screen.
  const target = conversationOfRow(row, conversations);
  const targetId = target?.id ?? null;
  const targetHidden = target ? !isVisible(state, target) : false;
  useEffect(() => {
    if (!targetId) return;
    dispatch({ type: "show", id: targetId, hidden: targetHidden });
    // Only a new result opens a conversation; later filter changes must not reopen it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, dispatch]);
  useRowFocus(conversations.map(rowIdOf));

  function open(id: string, byKeyboard: boolean) {
    if (id !== state.selected) setDraft("");
    if (byKeyboard) focusNext.current = "composer";
    dispatch({ type: "open", id });
  }
  // The summary button: show everyone, then open the conversation that waits longest.
  function replyToLongest(byKeyboard: boolean) {
    if (!summary.targetId) return;
    if (summary.targetId !== state.selected) setDraft("");
    if (byKeyboard) focusNext.current = "composer";
    dispatch({ type: "replyTo", id: summary.targetId });
  }
  function send() {
    if (!draft.trim()) {
      inputRef.current?.focus();
      return;
    }
    dispatch({ type: "send", text: draft });
    setDraft("");
  }
  function quick(text: string) {
    setDraft(fillText(text, BUSINESS));
    inputRef.current?.focus();
  }

  return (
    <div className={`fd-ix${state.open ? " is-open" : ""}`}>
      <section className="fd-phd fd-in" style={{ "--i": 0 } as React.CSSProperties}>
        <h1 className="fd-pt">Inbox</h1>
        <p className="fd-pw"><span className="fd-wd">Every text, call, email, Facebook and Instagram message in one place. The ones that wait on you sit on top.</span><span className="fd-wm">Every message in one place. The ones that wait on you sit on top.</span></p>
      </section>

      <div className="fd-ixg fd-in" style={{ "--i": 1 } as React.CSSProperties}>
        <section className="fd-il" aria-label="Conversations">
          <FilterBar filter={state.filter} counts={counts} onChange={(filter) => dispatch({ type: "filter", filter })} />
          <WaitSummary summary={summary} onReply={replyToLongest} />
          <div className="fd-crs" ref={rowsRef}>
            {conversations.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                needsReply={!!state.needs[c.id]}
                selected={state.selected === c.id}
                visible={isVisible(state, c)}
                time={rowTime(state, c)}
                snippet={rowSnippet(state, c, BUSINESS)}
                rowId={rowIdOf(c)}
                onOpen={(byKeyboard) => open(c.id, byKeyboard)}
              />
            ))}
            <div className={`fd-none${visibleCount(state, conversations) ? " is-off" : ""}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
              <p>Nobody waits this long.</p>
              <button type="button" className="fd-btn is-plain" onClick={() => dispatch({ type: "filter", filter: "all" })}>Show all</button>
            </div>
          </div>
        </section>

        <section className="fd-th" aria-label="The open conversation">
          <header className="fd-thh">
            <button type="button" className="fd-link fd-tback" onClick={() => dispatch({ type: "toList" })}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6" /></svg>Inbox
            </button>
            <span className="fd-av" aria-hidden="true"><span className="fd-h">{current.initials}</span></span>
            <div className="fd-thx">
              <h2 className="fd-thn"><span className="fd-h">{current.name}</span></h2>
              <p className="fd-ths"><span className="fd-h">{current.channel} · {current.sub}</span><span className="fd-thc"> · <span className="fd-h">{current.contact}</span></span></p>
            </div>
            {current.phone ? (
              <span className="fd-tha">
                <a className="fd-btn is-plain fd-tcall" href={`tel:${current.phone.replace(/[^\d+]/g, "")}`} aria-label={`Call ${current.name}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M5 4h4l1.5 4.5-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2L20 15v4a1 1 0 0 1-1 1A15 15 0 0 1 4 5a1 1 0 0 1 1-1z" /></svg><span>Call</span>
                </a>
              </span>
            ) : null}
          </header>
          {/* Only the status line and the Delivered/Seen line are live, so opening another conversation
              does not read the whole thread out again. */}
          <div ref={threadRef} className={`fd-tm${state.event === "open" ? ` is-sw-${state.swaps % 2 ? "a" : "b"}` : ""}`}>
            <div className="fd-tcv">
              <ThreadBody conversation={current} business={BUSINESS} sent={sent} fresh={fresh} />
            </div>
            <p className={`fx-dlv${delivery.show ? "" : " is-off"}`} aria-live="polite"><span className="fd-h">{delivery.text}</span></p>
            <p className="fd-tst" aria-live="polite">
              <span className={`fd-chip ${waitLevelClass(current.minutesWaiting)}${needs ? "" : " is-off"}`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                <span className="fd-h">{waitLabel(current.minutesWaiting)}</span>
              </span>
              <span className={`fd-chip is-plain${needs ? " is-off" : ""}`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>No reply needed
              </span>
              <button type="button" className="fd-link fd-tdone" onClick={() => dispatch({ type: "toggleDone" })}><span className="fd-h">{doneLabel(state, current)}</span></button>
            </p>
          </div>
          <footer className="fd-cmp">
            <div className="fd-qr" role="group" aria-label="Quick replies">
              {quickReplies.map((q) => (
                <button key={q.label} type="button" className="fd-qb" onClick={() => quick(q.text)}>{q.label}</button>
              ))}
            </div>
            <label className="fd-clb" htmlFor="fd-reply"><span className="fd-h">{replyLabel(current)}</span></label>
            <div className="fd-cmr">
              <input
                ref={inputRef}
                className="fd-cin"
                id="fd-reply"
                type="text"
                placeholder="Type your message"
                autoComplete="off"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); send(); } }}
              />
              <button type="button" className="fd-btn is-fill fd-send" onClick={send}>Send</button>
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
}
