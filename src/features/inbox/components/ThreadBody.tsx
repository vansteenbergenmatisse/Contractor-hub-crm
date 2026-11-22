import type { Conversation, TextBusiness } from "../types";
import { shownSent } from "../api/state";
import { fillText } from "../api/text";

const BOLT = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>;
const CALL = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M5 4h4l1.5 4.5-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2L20 15v4a1 1 0 0 1-1 1A15 15 0 0 1 4 5a1 1 0 0 1 1-1z" /></svg>;
const FORM = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><rect x="5" y="3.5" width="14" height="17" rx="2" /><path d="M8.5 8h7M8.5 12h7M8.5 16h4" /></svg>;

// The messages of one conversation, in order: sample thread, then the owner's newest 4 messages typed
// here (the design keeps 4 slots; older ones drop off the top).
export function ThreadBody({ conversation: c, business, sent, fresh }: { conversation: Conversation; business: TextBusiness; sent: readonly string[]; fresh: "" | "a" | "b" }) {
  const shown = shownSent(sent);
  const offset = sent.length - shown.length;
  return (
    <>
      {c.thread.map((item, i) => {
        if (item.type === "day") return <p key={i} className="fd-mday">{item.label}</p>;
        if (item.type === "event") return <p key={i} className="fd-mev">{item.icon === "call" ? CALL : FORM}{item.text}</p>;
        const text = fillText(item.text, business);
        if (item.type === "in") return <div key={i} className="fd-m is-in"><p className="fd-mb">{text}</p><p className="fd-mt">{item.time}</p></div>;
        if (item.type === "out") return <div key={i} className="fd-m is-out"><p className="fd-mb">{text}</p><p className="fd-mt">You · {item.time}</p></div>;
        return <div key={i} className="fd-m is-sys"><p className="fd-mb">{text}</p><p className="fd-mt">{BOLT}Sent by the system · {item.time}</p></div>;
      })}
      {shown.map((text, i) => (
        <div key={`s${offset + i}`} className={`fd-m is-out${fresh && i === shown.length - 1 ? ` is-new-${fresh}` : ""}`}>
          <p className="fd-mb">{text}</p>
          <p className="fd-mt">You · Just now</p>
        </div>
      ))}
    </>
  );
}
