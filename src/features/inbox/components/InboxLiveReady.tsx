"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { usePushed, useSearchRows, type SearchRow } from "@/features/app-shell";
import type { InboxResult } from "../types";
import { InboxHeader } from "./InboxHeader";
import { LiveConversationRow } from "./LiveConversationRow";
import { LiveThreadBody } from "./LiveThreadBody";

const PHONE = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M5 4h4l1.5 4.5-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2L20 15v4a1 1 0 0 1-1 1A15 15 0 0 1 4 5a1 1 0 0 1 1-1z" /></svg>;
const OFF_NOTE = "Replying and calling from here are off for now. Nothing is sent.";

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");

// The real inbox, read-only. Opening a conversation is a server navigation (`?row=inbox-<id>`).
export function InboxLiveReady({ result }: { result: Extract<InboxResult, { state: "ready" }> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { conversations, selectedId, thread } = result;
  const current = conversations.find((c) => c.id === selectedId) ?? null;
  const isOpen = !!current;
  usePushed(isOpen);
  const rows = useMemo<SearchRow[]>(
    () => conversations.map((c) => ({ id: `inbox-${c.id}`, page: "inbox", name: c.name, sub: `${c.channel ?? "Message"} · ${c.snippet}`, href: "/inbox" })),
    [conversations],
  );
  useSearchRows("inbox", rows);
  const go = (href: string) => startTransition(() => router.push(href));

  return (
    <div className={`fd-ix${isOpen ? " is-open" : ""}`}>
      <InboxHeader />
      <div className="fd-ixg fd-in" style={{ "--i": 1 } as React.CSSProperties}>
        <section className="fd-il" aria-label="Conversations" aria-busy={pending}>
          {!result.complete && <p className="fd-mday">Showing the newest conversations only.</p>}
          {result.dropped > 0 && <p className="fd-mday">Some conversations could not be shown.</p>}
          <div className="fd-crs">
            {conversations.map((c) => (
              <LiveConversationRow key={c.id} conversation={c} selected={c.id === selectedId} onOpen={() => go(`/inbox?row=${encodeURIComponent(`inbox-${c.id}`)}`)} />
            ))}
          </div>
        </section>

        <section className="fd-th" aria-label="The open conversation" aria-busy={pending}>
          {current && thread ? (
            <>
              <header className="fd-thh">
                <button type="button" className="fd-link fd-tback" onClick={() => go("/inbox")}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6" /></svg>Inbox
                </button>
                <span className="fd-av" aria-hidden="true"><span className="fd-h">{initialsOf(current.name)}</span></span>
                <div className="fd-thx">
                  <h2 className="fd-thn"><span className="fd-h">{current.name}</span></h2>
                  <p className="fd-ths"><span className="fd-h">{current.channel ?? "Message"}</span></p>
                </div>
                <span className="fd-tha">
                  <button type="button" className="fd-btn is-plain fd-tcall" disabled aria-label="Call (off for now)" title={OFF_NOTE}>{PHONE}<span>Call</span></button>
                </span>
              </header>
              <div className="fd-tm"><LiveThreadBody thread={thread} /></div>
              <footer className="fd-cmp">
                <label className="fd-clb" htmlFor="fd-reply"><span className="fd-h">{OFF_NOTE}</span></label>
                <div className="fd-cmr">
                  <input className="fd-cin" id="fd-reply" type="text" placeholder="Replies are off" autoComplete="off" disabled />
                  <button type="button" className="fd-btn is-fill fd-send" disabled>Send</button>
                </div>
              </footer>
            </>
          ) : (
            <div className="fd-none fx-none" role="status"><p>Pick a conversation</p><span>Its messages show up here.</span></div>
          )}
        </section>
      </div>
    </div>
  );
}
