"use client";

import { useRouter } from "next/navigation";
import { initialsOf } from "../api/quotes";
import type { LiveQuote, QuotesResult } from "../types";

const COPY = {
  empty: { title: "No quotes yet", body: "Quotes from your CRM will show here." },
  reconnect: { title: "Your CRM connection needs attention.", body: "Quotes can't load until it is reconnected. Ask your account admin to reconnect it." },
  unavailable: { title: "Your quotes can't load right now.", body: "Nothing was changed. Try again in a moment." },
} as const;

function LiveQuoteRow({ quote }: { quote: LiveQuote }) {
  const facts = [quote.detail, quote.issuedLabel ? `Issued ${quote.issuedLabel}` : null, quote.currency ? `Currency ${quote.currency}` : null].filter(Boolean).join(" · ");
  return (
    <div className="fd-rw" id={`fd-qt-${quote.id}`} data-row-id={`quote-${quote.id}`}>
      <div className="fd-rm">
        <span className="fd-av" aria-hidden="true">{initialsOf(quote.title)}</span>
        <div className="fd-rbx">
          <p className="fd-rn">{quote.title}</p>
          {facts ? <p className="fd-rsb">{facts}</p> : null}
          {quote.statusLabel ? <div className="fd-rtg"><span className={`fd-chip ${quote.statusTone}`}>{quote.statusLabel}</span></div> : null}
        </div>
      </div>
      <div className="fd-rac"><span className="fd-ram">{quote.amountText ?? "No amount"}</span></div>
    </div>
  );
}

// The real Quotes page, view only: it holds no control that can send, approve, build, upload or edit.
export function QuotesLivePage({ result }: { result: QuotesResult }) {
  const router = useRouter();
  return (
    <div className="fd-dv">
      <section className="fd-phd fd-in" style={{ "--i": 0 } as React.CSSProperties}>
        <h1 className="fd-pt">Quotes</h1>
        <p className="fd-pw">This page is view only. Send, approve or change a quote in your CRM.</p>
      </section>
      {result.state === "ready" ? (
        <div className="fd-in" style={{ "--i": 1 } as React.CSSProperties}>
          <p className="fd-pw">Amounts show exactly as your CRM records them.</p>
          {!result.complete ? <p className="fd-pw" role="status">Showing {result.quotes.length} of {result.total} quotes.</p> : null}
          {result.dropped > 0 ? <p className="fd-pw" role="status">{result.dropped} {result.dropped === 1 ? "quote" : "quotes"} could not be read and {result.dropped === 1 ? "is" : "are"} left out.</p> : null}
          <div className="fd-lst">
            {result.quotes.map((quote) => <LiveQuoteRow key={quote.id} quote={quote} />)}
          </div>
        </div>
      ) : (
        <div className={`fd-none fx-none fd-in${result.state !== "empty" ? " is-bad" : ""}`} role={result.state === "empty" ? "status" : "alert"}>
          <p>{COPY[result.state].title}</p>
          <span>{COPY[result.state].body}</span>
          {result.state === "unavailable" ? <button type="button" className="fd-btn is-plain" onClick={() => router.refresh()}>Try again</button> : null}
        </div>
      )}
    </div>
  );
}
