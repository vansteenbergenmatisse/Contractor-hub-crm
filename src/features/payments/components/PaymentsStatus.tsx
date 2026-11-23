"use client";

import { useRouter } from "next/navigation";

const COPY = {
  reconnect: { title: "Your CRM connection needs attention.", body: "Payments can't load until it is reconnected. Ask your account admin to reconnect it." },
  unavailable: { title: "Your payments can't load right now.", body: "Nothing was changed. Try again in a moment." },
  empty: { title: "Nobody owes you money.", body: "No payments are on record yet." },
} as const;

// The page when no payment can be shown. It says what is true and what to do next.
export function PaymentsStatus({ state }: { state: keyof typeof COPY }) {
  const router = useRouter();
  const copy = COPY[state];
  const failed = state !== "empty";
  return (
    <>
      <section className="fd-phd fd-in"><h1 className="fd-pt">Payments due</h1></section>
      <div className={`fd-none fx-none fd-in${failed ? " is-bad" : ""}`} role={failed ? "alert" : "status"}>
        <p>{copy.title}</p>
        <span>{copy.body}</span>
        {state === "unavailable" && <button type="button" className="fd-btn is-plain" onClick={() => router.refresh()}>Try again</button>}
      </div>
    </>
  );
}
