"use client";

import { useSearchParams } from "next/navigation";

const ANSWER: Record<string, string> = {
  busy: "Too many exports. Try again later.",
  failed: "The export did not work. Try again.",
};

// Owner only: the server decides whether this renders, and the route checks again. A plain form post
// downloads the file and leaves the page as it is. A failure comes back as ?export=<reason>.
export function ExportPanel() {
  const code = useSearchParams().get("export");
  const message = code && Object.hasOwn(ANSWER, code) ? ANSWER[code] : null;
  return (
    <section className="fd-pnl" aria-labelledby="fd-ld-x">
      <h2 className="fd-pnh" id="fd-ld-x">Export leads</h2>
      <p className="fd-pns">Name, source and date. A long list may hold only your newest leads, and the file name then says partial.</p>
      <form method="post" action="/api/leads/export">
        <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
          <input type="checkbox" name="includeContact" value="1" />
          <span>Include phone, email and address</span>
        </label>
        <button type="submit" className="fd-btn is-plain">Export CSV</button>
      </form>
      {message ? <p className="fd-pns" role="alert">{message}</p> : null}
    </section>
  );
}
