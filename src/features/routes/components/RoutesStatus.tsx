"use client";

import { useRouter } from "next/navigation";
import { RoutesHeader } from "./RoutesHeader";

const COPY = {
  reconnect: { title: "Your CRM connection needs attention.", body: "Your jobs can't load until it is reconnected. Ask your account admin to reconnect it." },
  unavailable: { title: "Your jobs can't load right now.", body: "Nothing was changed. Try again in a moment." },
} as const;

// The page when no jobs can be shown. It says what is true and what to do next.
export function RoutesStatus({ state }: { state: keyof typeof COPY }) {
  const router = useRouter();
  const copy = COPY[state];
  return (
    <div className="fd-cal">
      <RoutesHeader />
      <div className="fd-none fx-none fd-in is-bad" role="alert">
        <p>{copy.title}</p>
        <span>{copy.body}</span>
        {state === "unavailable" && <button type="button" className="fd-btn is-plain" onClick={() => router.refresh()}>Try again</button>}
      </div>
    </div>
  );
}
