"use client";

import { useRouter } from "next/navigation";
import { Glyph } from "./Glyph";

const COPY = {
  empty: { icon: "check", title: "No leads yet.", body: "New contacts show up here as soon as they come in." },
  reconnect: { icon: "alert", title: "Your CRM connection needs attention.", body: "Leads can't load until it is reconnected. Ask your account admin to reconnect it." },
  unavailable: { icon: "alert", title: "Your leads can't load right now.", body: "Nothing was changed. Try again in a moment." },
} as const;

// The card's body when there are no rows. The same words as the Leads page.
export function LeadsCardStatus({ state }: { state: keyof typeof COPY }) {
  const router = useRouter();
  const copy = COPY[state];
  return (
    <div className="fd-none fx-none" role={state === "empty" ? "status" : "alert"}>
      <Glyph name={copy.icon} size={20} />
      <p>{copy.title}</p>
      <span>{copy.body}</span>
      {state === "unavailable" && <button type="button" className="fd-btn is-plain" onClick={() => router.refresh()}>Try again</button>}
    </div>
  );
}
