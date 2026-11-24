"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { exportAnswer } from "../api/export-answer";

// A new try drops the old failure from the screen and the address, so it cannot sit beside a
// successful download or return on refresh. A new failure comes back as ?export=<reason>.
function clearExportFromAddress() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("export")) return;
  url.searchParams.delete("export");
  window.history.replaceState(window.history.state, "", url);
}

// Owner only: the server decides whether this renders, and the route checks again. A plain form post
// downloads the file and leaves the page as it is.
export function ExportPanel() {
  const code = useSearchParams().get("export");
  const [retried, setRetried] = useState(false);
  const message = retried ? null : exportAnswer(code);
  return (
    <section className="fd-pnl" aria-labelledby="fd-ld-x">
      <h2 className="fd-pnh" id="fd-ld-x">Export leads</h2>
      <p className="fd-pns">Name, source and date. A long list may hold only your newest leads, and the file name then says partial.</p>
      <form method="post" action="/api/leads/export" onSubmit={() => { setRetried(true); clearExportFromAddress(); }}>
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
