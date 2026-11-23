"use client";

import { useState, type ReactNode } from "react";
import { COLOR_GROUPS, CONNECTIONS, ESSENTIAL_FIELDS, SECTIONS, SOON_ITEMS, SWITCHES, labelOfKey, sectionOfKey } from "../api/fields";
import { dirtyKeysOf, type SettingsState } from "../api/state";
import { UNKNOWN_CONNECTIONS, connectionsIntro } from "../api/connections";
import { useSaveValues } from "../hooks/use-save-values";
import { useSettings } from "../hooks/use-settings";
import { useSignOut } from "../hooks/use-sign-out";
import type { ConnectionStatus, Field, SaveValues, SectionKey } from "../types";
import { ConnectionRow } from "./ConnectionRow";
import { svgProps } from "./svg-props";
import { ValueField } from "./ValueField";

// Page CONTENT for /settings. It renders inside the shell's `.fd-view[data-pg]` wrapper. The design's
// CSS keys off data-sec, data-open and data-q on a `.fd-view`, so this component renders a nested
// `.fd-view` that carries them (the shell's wrapper stays untouched).

const NAV_ICONS: Record<SectionKey, ReactNode> = {
  biz: (<><path d="M4 20V6l8-3 8 3v14" /><path d="M9 20v-5h6v5" /></>),
  colors: (<><circle cx="12" cy="12" r="9" /><circle cx="8.5" cy="10" r="1.2" /><circle cx="12" cy="7.5" r="1.2" /><circle cx="15.5" cy="10" r="1.2" /><path d="M12 21a3 3 0 0 1 0-6h2" /></>),
  conn: (<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>),
  choice: (<><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>),
  soon: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
};

// `initialValues` is the signed-in sub-account's custom values (key to value), already filtered by the
// server allowlist. When given, it replaces the sample values: keys it lacks show empty fields, and
// allowed keys the design does not list show too. `initialSection` comes from `?section=` in the URL.
// `connections` is each row's real status in CONNECTIONS order; without it every row says
// "Not available yet".
type Props = {
  initial?: SettingsState;
  initialValues?: Record<string, string>;
  initialSection?: SectionKey;
  connections?: readonly ConnectionStatus[];
};

// `saveValues`: given only when this owner may save to the sub-account. Without it Save lasts for this visit.
export function SettingsPage({ initial, initialValues, initialSection, connections = UNKNOWN_CONNECTIONS, readOnly = false, saveValues }: Props & { readOnly?: boolean; saveValues?: SaveValues }) {
  const live = !!saveValues && !readOnly;
  const { state, dispatch, filter, extras, phone, choicesAvailable, notLoaded } = useSettings(initial, initialValues, initialSection, connections, live);
  const remote = useSaveValues(state, dispatch, saveValues);
  const signOut = useSignOut();
  const [signOutFailed, setSignOutFailed] = useState(false);
  const { values, draft, err } = state;
  const show = (id: string) => filter.items[id];
  const dirtyKeys = dirtyKeysOf(values, draft);
  const dirty = dirtyKeys.length > 0;
  const dirtySections = new Set<SectionKey>(dirtyKeys.map((k) => sectionOfKey(k) ?? "biz"));
  // An error shows next to its field when that field can be seen. A search shows the color fields
  // even when they are closed. Otherwise the top alert carries the message.
  const errFieldSeen = !!err && !!show(`cv-${err.key}`) &&
    (filter.active || (state.sec === err.section && (err.section !== "colors" || state.cols)));
  // Only where the page would otherwise speak for the account: a live save or a client view.
  const loadFailed = notLoaded && (live || readOnly);
  const loadMessage = readOnly ? "Your details did not load. Reload this page to try again." : "Your details did not load, so nothing can be saved. Reload this page to try again.";
  const topMessage = (errFieldSeen ? null : err?.message) ?? (loadFailed ? loadMessage : null);
  const edit = (key: string, value: string) => dispatch({ type: "edit", key, value });
  const fieldProps = (f: Field) => ({ field: f, value: draft[f.key] ?? "", saved: values[f.key] ?? "", invalid: err?.key === f.key, error: errFieldSeen && err?.key === f.key ? err.message : undefined, readOnly, onChange: edit });

  const bizFields = [...ESSENTIAL_FIELDS, ...extras.map((key) => ({ key, label: labelOfKey(key) }))].filter((f) => show(`cv-${f.key}`));
  
  return (
    <div
      className="fd-view"
      data-sec={state.sec}
      data-open={state.open ? "1" : "0"}
      data-q={filter.active ? "1" : "0"}
    >
      <section className="fd-phd fd-in" style={{ "--i": 0 } as React.CSSProperties}>
        <h1 className="fd-pt">Settings</h1>
        <p className="fd-pw">
          <span className="fd-wd">Your business details, brand colors and connections in one place. The details and colors come from your account.</span>
          <span className="fd-wm">Your business details, brand colors and connections.</span>
        </p>
      </section>

      <nav className="fx-stnav" aria-label="Settings sections">
        <div className="fx-stq">
          <svg width="17" height="17" {...svgProps}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <label className="fx-vh" htmlFor="fx-st-q">Search settings</label>
          <input
            className="fx-stin"
            id="fx-st-q"
            type="search"
            placeholder="Search settings"
            autoComplete="off"
            spellCheck={false}
            value={state.q}
            onChange={(e) => dispatch({ type: "search", q: e.target.value })}
          />
        </div>
        <ul className="fx-stl">
          {SECTIONS.map((s) => (
            <li key={s.key}>
              <button
                type="button"
                className={`fx-stni${state.sec === s.key ? " is-on" : ""}`}
                aria-current={state.sec === s.key ? "page" : "false"}
                onClick={() => {
                  setSignOutFailed(false);
                  dispatch({ type: "go", section: s.key });
                }}
              >
                <span className="fx-sti"><svg width="17" height="17" {...svgProps}>{NAV_ICONS[s.key]}</svg></span>
                <span className="fx-stt">
                  {s.title}
                  {dirtySections.has(s.key) ? <span className="fd-hint" style={{ display: "block" }}>Not applied yet</span> : null}
                </span>
                <svg className="fx-stch" width="16" height="16" {...svgProps}><path d="m9 6 6 6-6 6" /></svg>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <button type="button" className="fd-link fx-stback" onClick={() => dispatch({ type: "back" })}>
        <svg width="18" height="18" {...svgProps}><path d="m15 6-6 6 6 6" /></svg>
        <span>Settings</span>
      </button>

      <p className="fx-stnone" role="status" style={filter.active && !filter.any ? { display: "block" } : undefined}>
        No settings match your search.
      </p>

      <div className="fx-stbody">
        <p className={`fd-lerr fd-ste${topMessage ? "" : " is-off"}`} id="fd-st-err" role="alert">
          <svg width="16" height="16" {...svgProps}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.3" /></svg>
          <span><span className="fd-h">{topMessage ?? ""}</span></span>
        </p>

        {filter.sections.biz ? (
          <section className="fd-pnl fd-in" style={{ "--i": 1 } as React.CSSProperties} aria-labelledby="fd-st-1">
            <h2 className="fd-pnh" id="fd-st-1">Business details</h2>
            <p className="fd-pns">{readOnly ? "Your business name, contact details and links." : live ? "Your business name, contact details and links. Saved changes update your account, and can change your website and texts." : "Your business name, contact details and links. Changes here do not reach your website or texts yet."}</p>
            <div className="fd-cvg">{bizFields.map((f) => <ValueField key={f.key} {...fieldProps(f)} />)}</div>
          </section>
        ) : null}

        {filter.sections.colors ? (
          <section className="fd-pnl fd-in" style={{ "--i": 2 } as React.CSSProperties} aria-labelledby="fd-st-2">
            <h2 className="fd-pnh" id="fd-st-2">Brand colors</h2>
            <p className="fd-pns">{readOnly ? "The brand colors this account uses." : live ? "Type a color like #2E7D32, then press Save to your account." : "Type a color like #2E7D32, then press Apply for this visit."}</p>
            <button
              type="button"
              className="fd-btn is-plain fd-cvt"
              aria-expanded={state.cols}
              aria-controls="fd-st-col"
              onClick={() => dispatch({ type: "toggleCols" })}
            >
              <span className="fd-h">{state.cols ? "Hide the color fields" : readOnly ? "Show the brand colors" : "Change the brand colors"}</span>
            </button>
            <div className={`fd-cvg${state.cols ? "" : " is-off"}`} id="fd-st-col">
              {/* The group headings stay while searching, as in the design; only fields hide. */}
              {COLOR_GROUPS.map((g) => {
                const fields = g.fields.filter((f) => show(`cv-${f.key}`));
                return [
                  <h3 className="fd-cgh" key={`h-${g.heading}`}>{g.heading}</h3>,
                  ...fields.map((f) => <ValueField key={f.key} {...fieldProps(f)} swatch />),
                ];
              })}
            </div>
          </section>
        ) : null}

        {/* CSS hides it on the sections without fields. While searching it shows only with a field. */}
        {filter.sections.biz || filter.sections.colors ? (
          <div className="fd-cvsv fd-in" style={{ "--i": 3 } as React.CSSProperties}>
            <p className={`fd-okl${state.ok && !dirty ? "" : " is-off"}`} role="status" style={{ flexBasis: "100%", marginBottom: 0 }}>
              <svg width="16" height="16" {...svgProps} strokeWidth={2.2}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
              <span>{live ? "Saved to your account." : "Changed for this visit only. Not saved to your account yet."}</span>
            </p>
            {live && remote.problem ? <p className="fd-pns" role="alert" style={{ flexBasis: "100%", marginBottom: 0 }}>{remote.problem}</p> : null}
            <button type="button" className="fd-btn is-fill fd-lgo fd-cvs" disabled={readOnly || (live && (remote.saving || loadFailed))} onClick={() => (live ? void remote.save() : dispatch({ type: "save" }))}>
              {readOnly ? "Read-only view" : live ? (remote.saving ? "Saving…" : "Save to your account") : "Apply for this visit"}
            </button>
            <p className="fd-pns fd-hint" role="status">{readOnly ? "You are viewing this account. Nothing can be changed here." : loadFailed ? "Nothing can be saved until your details load." : live
              ? (dirty ? "You have changes that are not saved yet." : "Your account has these values.")
              : (dirty ? "You have changes that are not applied yet." : "Changes last until you close or reload this page.")}</p>
          </div>
        ) : null}

        {filter.sections.conn ? (
          <section className="fd-stsec fd-in" style={{ "--i": 4 } as React.CSSProperties} aria-labelledby="fd-st-4">
            <h2 className="fd-pnh" id="fd-st-4">Connections</h2>
            <p className="fd-pns fd-sts">{connectionsIntro(connections)}</p>
            <div className="fd-lst">
              {CONNECTIONS.map((c, i) =>
                show(`conn-${i}`) ? (
                  <ConnectionRow
                    key={c.name}
                    connection={c}
                    status={connections[i] ?? { state: "unknown" }}
                    phone={i === 0 ? phone : ""}
                    a2p={i === 0}
                    how={!!state.how[i]}
                    asked={!!state.asked[i]}
                    onHow={() => dispatch({ type: "how", index: i })}
                    onAsk={() => dispatch({ type: "ask", index: i })}
                  />
                ) : null,
              )}
            </div>
          </section>
        ) : null}

        <div className="fd-cols fd-st2 fd-in" style={{ "--i": 5 } as React.CSSProperties}>
          {filter.sections.choice ? (
            <section aria-labelledby="fd-st-3">
              <h2 className="fd-pnh" id="fd-st-3">Your choices</h2>
              <p className="fd-pns fd-sts">{choicesAvailable ? "Each switch works at once." : "We do not have these choices yet."}</p>
              <div className="fd-lst">
                {SWITCHES.map((label, i) =>
                  show(`sw-${i}`) ? (
                    <div className="fd-rw" key={label}>
                      <div className="fd-rm"><div className="fd-rbx"><p className="fd-rn">{label}</p></div></div>
                      <div className="fd-rac">
                        {!choicesAvailable ? <span className="fd-chip is-plain">Not available yet</span> : <button
                          type="button"
                          className={`fd-swb${state.sw[i] ? " is-on" : ""}`}
                          role="switch"
                          aria-checked={state.sw[i]}
                          aria-label={label}
                          onClick={() => dispatch({ type: "switch", index: i as 0 | 1 })}
                        >
                          <i aria-hidden="true" />
                          <span><span className="fd-h">{state.sw[i] ? "On" : "Off"}</span></span>
                        </button>}
                      </div>
                    </div>
                  ) : null,
                )}
              </div>
            </section>
          ) : null}
          {filter.sections.soon ? (
            <section aria-labelledby="fd-st-5">
              <h2 className="fd-pnh" id="fd-st-5">Not available yet</h2>
              <p className="fd-pns fd-sts">We do not have these features yet.</p>
              <div className="fd-lst">
                {SOON_ITEMS.map((label, i) =>
                  show(`soon-${i}`) ? (
                    <div className="fd-rw" key={label}>
                      <div className="fd-rm"><div className="fd-rbx"><p className="fd-rn">{label}</p></div></div>
                      <div className="fd-rac"><span className="fd-chip is-plain">Not available yet</span></div>
                    </div>
                  ) : null,
                )}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        className="fd-btn is-plain fd-lgo fd-stout"
        onClick={() => {
          setSignOutFailed(false);
          void signOut().then((ok) => setSignOutFailed(!ok));
        }}
      >Sign out</button>
      {signOutFailed ? <p className="fd-lerr" role="alert" style={{ gridColumn: "1 / -1" }}>Could not sign out. Try again.</p> : null}
    </div>
  );
}
