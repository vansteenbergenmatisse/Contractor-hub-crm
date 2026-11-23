"use client";

import { useRouter } from "next/navigation";
import { CalendarHeader } from "./CalendarHeader";
import { Glyph } from "./Glyph";

const COPY = {
  reconnect: { title: "Your CRM connection needs attention.", body: "The calendar can't load until it is reconnected. Ask your account admin to reconnect it." },
  unavailable: { title: "Your calendar can't load right now.", body: "Nothing was changed. Try again in a moment." },
} as const;

// The page when no week can be shown. It says what is true and what to do next.
export function CalendarStatus({ state }: { state: keyof typeof COPY }) {
  const router = useRouter();
  const copy = COPY[state];
  return (
    <div className="fd-cal">
      <CalendarHeader readOnly />
      <div className="fd-none fx-none fd-in is-bad" role="alert">
        <Glyph name="alert" size={20} />
        <p>{copy.title}</p>
        <span>{copy.body}</span>
        {state === "unavailable" && <button type="button" className="fd-btn is-plain" onClick={() => router.refresh()}>Try again</button>}
      </div>
    </div>
  );
}
