import type { Summary } from "../api/state";

export function WaitSummary({ summary, onReply }: { summary: Summary; onReply: () => void }) {
  return (
    <div className={summary.cls} role="status">
      <svg className="fd-wsi fd-wsi-c" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
      <svg className="fd-wsi fd-wsi-k" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 9.6" /></svg>
      <p className="fd-wsx"><b><span className="fd-h">{summary.lead}</span></b> <span><span className="fd-h">{summary.rest}</span></span></p>
      <button type="button" className={`fd-wsgo${summary.calm ? " is-off" : ""}`} onClick={onReply}><span className="fd-h">{summary.button}</span></button>
    </div>
  );
}
