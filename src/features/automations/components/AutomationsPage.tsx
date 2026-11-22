"use client";

import { Fragment } from "react";
import { PageAction, usePushed } from "@/features/app-shell";
import { groupByFolder, totals } from "../api/automations";
import { useAutomations } from "../hooks/use-automations";
import { AutomationEditor } from "./AutomationEditor";
import { AutomationRow } from "./AutomationRow";

const icon = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false } as const;

// Page content only. The route renders it inside the app shell's `fd-view` wrapper.
export function AutomationsPage() {
  const a = useAutomations();
  const { state } = a;
  const open = state.edit !== null;
  const t = totals(state.items);
  const groups = groupByFolder(state.items);
  const removed = state.last ? state.items.find((x) => x.id === state.last && x.gone) : undefined;
  const target = state.edit && !a.isNew ? state.items.find((x) => x.id === state.edit) ?? null : null;

  // On a phone the editor is a pushed detail: tab bar and action bar step aside.
  usePushed(open);

  return (
    <div className={`fd-au${open ? " is-edit" : ""}`}>
      <PageAction>
        <button type="button" className="fd-btn is-fill fx-accb" onClick={a.make}>
          <svg {...icon}><path d="M12 5v14M5 12h14" /></svg>New automation
        </button>
      </PageAction>
      <section className="fd-phd fd-in" style={{ "--i": 0 } as React.CSSProperties}>
        <h1 className="fd-pt">Automations</h1>
        <p className="fd-pw">
          <span className="fd-wd">Everything the system does for you, in one list. Each row says when it starts, what it does and when it stops. Switch one off, change it or add one.</span>
          <span className="fd-wm">Everything the system does for you. Switch it off, change it or add one.</span>
        </p>
      </section>
      <div className="fd-cols fd-in" style={{ "--i": 1 } as React.CSSProperties}>
        <div>
          <section className="fd-sum fd-sumc" aria-label="In numbers">
            <div className="fd-smt"><p className="fd-smv"><span className="fd-h">{t.on}</span></p><p className="fd-sml">Running</p></div>
            <div className="fd-smt"><p className="fd-smv"><span className="fd-h">{t.off}</span></p><p className="fd-sml">Switched off</p></div>
            <div className="fd-smt"><p className="fd-smv"><span className="fd-h">{t.all}</span></p><p className="fd-sml">In total</p></div>
          </section>
          <p className={`fd-okl${removed ? "" : " is-off"}`} role="status">
            <svg {...icon}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
            <span><span className="fd-h">{removed ? `Removed: ${removed.name}.` : ""}</span></span>
            <button type="button" className="fd-link" onClick={a.undo}>Undo</button>
          </p>
          <button type="button" className="fd-btn is-plain fd-addb fd-aunew" onClick={a.make}>
            <svg {...icon}><path d="M12 5v14M5 12h14" /></svg>New automation
          </button>
          <div className="fd-lst">
            {groups.length === 0 && (
              <p className="fd-pns">No automations here. Press Undo above or make a new one.</p>
            )}
            {groups.map((g) => (
              <Fragment key={g.folder}>
                <p className="fd-lgh">{g.folder}</p>
                {g.items.map((x) => (
                  <AutomationRow
                    key={x.id}
                    a={x}
                    selected={state.edit === x.id}
                    asking={state.conf === x.id}
                    onToggle={() => a.toggle(x.id)}
                    onEdit={() => a.edit(x.id)}
                    onAsk={() => a.ask(x.id)}
                    onRemove={() => a.remove(x.id)}
                    onKeep={a.keep}
                  />
                ))}
              </Fragment>
            ))}
          </div>
        </div>
        <div className="fd-side2">
          <AutomationEditor
            target={target}
            isNew={a.isNew}
            open={open}
            draft={a.draft}
            err={state.err}
            test={state.test}
            onChange={a.setDraft}
            onSave={a.save}
            onCancel={a.shut}
            onTest={a.sendTest}
            onMake={a.make}
          />
        </div>
      </div>
    </div>
  );
}
