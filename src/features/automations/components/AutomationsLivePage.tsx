"use client";

import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { AutomationsResult, LiveWorkflow } from "../types";

const stagger = (i: number) => ({ "--i": i }) as CSSProperties;
const STATUS_LABEL: Record<LiveWorkflow["status"], string> = { published: "Published", draft: "Draft", unknown: "Status not known" };

const COPY = {
  empty: { title: "No automations in this account yet.", body: "When one is added in your CRM, it shows here." },
  "not-enabled": { title: "Automation access isn't turned on for this account.", body: "This list stays empty until your CRM provider turns it on. Nothing was changed, and you don't need to reconnect." },
  reconnect: { title: "Your CRM connection needs attention.", body: "Your automations can't load until it is reconnected. Ask your account admin to reconnect it." },
  unavailable: { title: "Your automations can't load right now.", body: "Nothing was changed. Try again in a moment." },
} as const;

function Header() {
  return (
    <section className="fd-phd fd-in" style={stagger(0)}>
      <h1 className="fd-pt">Automations</h1>
      <p className="fd-pw">The automations in your account and their status. You can view them here. Changes are made in your CRM.</p>
    </section>
  );
}

function Status({ state }: { state: keyof typeof COPY }) {
  const router = useRouter();
  const copy = COPY[state];
  const bad = state === "reconnect" || state === "unavailable";
  return (
    <div className={`fd-none fx-none fd-in${bad ? " is-bad" : ""}`} role={bad ? "alert" : "status"}>
      <p>{copy.title}</p>
      <span>{copy.body}</span>
      {state === "unavailable" && <button type="button" className="fd-btn is-plain" onClick={() => router.refresh()}>Try again</button>}
    </div>
  );
}

// The real Automations page. It only reads: no switch, edit, test-send, publish or remove control.
export function AutomationsLivePage({ result }: { result: AutomationsResult }) {
  if (result.state !== "ready") {
    return (
      <div className="fd-au">
        <Header />
        <Status state={result.state} />
      </div>
    );
  }
  const { totals, workflows, complete, dropped } = result;
  return (
    <div className="fd-au">
      <Header />
      <section className="fd-sum fd-sumc fd-in" style={stagger(1)} aria-label="In numbers">
        <div className="fd-smt"><p className="fd-smv"><span className="fd-h">{totals.published}</span></p><p className="fd-sml">Published</p></div>
        <div className="fd-smt"><p className="fd-smv"><span className="fd-h">{totals.draft}</span></p><p className="fd-sml">Draft</p></div>
        <div className="fd-smt"><p className="fd-smv"><span className="fd-h">{totals.all}</span></p><p className="fd-sml">{complete && dropped === 0 ? "In total" : "Shown"}</p></div>
      </section>
      {(!complete || dropped > 0) && <p className="fd-pw" role="status">Some automations may be missing from this list.</p>}
      <div className="fd-lst fd-in" style={stagger(2)}>
        {workflows.map((w) => (
          <div key={w.id} className="fd-rw">
            <div className="fd-rm">
              <div className="fd-rbx">
                <div className="fd-rtg fd-auh">
                  <p className="fd-rn"><span className="fd-h">{w.name}</span></p>
                  <span className="fd-chip is-plain"><span className="fd-h">{STATUS_LABEL[w.status]}</span></span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
