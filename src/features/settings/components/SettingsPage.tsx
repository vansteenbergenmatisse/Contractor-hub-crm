"use client";

import type { ReactNode } from "react";
import { COLOR_GROUPS, CONNECTIONS, ESSENTIAL_FIELDS, SECTIONS, SOON_ITEMS, SWITCHES, labelOfKey } from "../api/fields";
import type { SettingsState } from "../api/state";
import { isHexColor } from "../api/live-save";
import { useSettings } from "../hooks/use-settings";
import { MOCK_CONNECTION_STATUS } from "../mock";
import type { Field, SectionKey } from "../types";

// Page CONTENT for /settings. It renders inside the shell's `.fd-view[data-pg]` wrapper. The design's
// CSS keys off data-sec, data-open and data-q on a `.fd-view`, so this component renders a nested
// `.fd-view` that carries them (the shell's wrapper stays untouched).

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
  focusable: "false" as const,
};

const NAV_ICONS: Record<SectionKey, ReactNode> = {
  biz: (<><path d="M4 20V6l8-3 8 3v14" /><path d="M9 20v-5h6v5" /></>),
  colors: (<><circle cx="12" cy="12" r="9" /><circle cx="8.5" cy="10" r="1.2" /><circle cx="12" cy="7.5" r="1.2" /><circle cx="15.5" cy="10" r="1.2" /><path d="M12 21a3 3 0 0 1 0-6h2" /></>),
  conn: (<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>),
  choice: (<><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>),
  soon: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
};

function ChipIcons() {
  return (
    <>
      <svg className="i-w" width="13" height="13" {...svgProps} strokeWidth={2.2}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
      <svg className="i-b" width="13" height="13" {...svgProps} strokeWidth={2.2}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.3" /></svg>
      <svg className="i-o" width="13" height="13" {...svgProps} strokeWidth={2.2}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
    </>
  );
}

type ValueFieldProps = {
  field: Field;
  value: string;
  saved: string;
  bad: boolean;
  swatch?: boolean;
  onChange: (key: string, value: string) => void;
};

function ValueField({ field, value, saved, bad, swatch, onChange }: ValueFieldProps) {
  return (
    <div className="fd-cvf">
      <label className="fd-ll" htmlFor={`cv-${field.key}`}>
        {field.label}
        <span className="fd-cvk">custom_values.{field.key}</span>
      </label>
      <div className="fd-cvi">
        {/* Only a hex color reaches the style attribute; anything else leaves the swatch empty. */}
        {swatch ? <span className="fd-swt" style={isHexColor(saved) ? { background: saved } : undefined} aria-hidden="true" /> : null}
        <input
          className="fd-lin"
          id={`cv-${field.key}`}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={value}
          aria-invalid={bad ? true : undefined}
          aria-describedby={bad ? "fd-st-err" : undefined}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      </div>
    </div>
  );
}

// `initialValues` is the signed-in sub-account's custom values (key to value), already filtered by the
// server allowlist. When given, it replaces the sample values: keys it lacks show empty fields, and
// allowed keys the design does not list show too. `initialSection` comes from `?section=` in the URL.
type Props = { initial?: SettingsState; initialValues?: Record<string, string>; initialSection?: SectionKey };

export function SettingsPage({ initial, initialValues, initialSection }: Props) {
  const { state, dispatch, filter, extras } = useSettings(initial, initialValues, initialSection);
  const { values, draft, err } = state;
  const show = (id: string) => filter.items[id];
  const edit = (key: string, value: string) => dispatch({ type: "edit", key, value });
  const fieldProps = (f: Field) => ({ field: f, value: draft[f.key] ?? "", saved: values[f.key] ?? "", bad: err?.key === f.key, onChange: edit });

  const bizFields = [...ESSENTIAL_FIELDS, ...extras.map((key) => ({ key, label: labelOfKey(key) }))].filter((f) => show(`cv-${f.key}`));
  const showSt2 = filter.sections.choice || filter.sections.soon;

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
          <span className="fd-wd">Your business details, brand colors and connections in one place. The details and colors come from your GoHighLevel custom values.</span>
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
                onClick={() => dispatch({ type: "go", section: s.key })}
              >
                <span className="fx-sti"><svg width="17" height="17" {...svgProps}>{NAV_ICONS[s.key]}</svg></span>
                <span className="fx-stt">{s.title}</span>
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
        <p className={`fd-okl${state.ok ? "" : " is-off"}`} role="status">
          <svg width="16" height="16" {...svgProps} strokeWidth={2.2}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          <span>Saved on this screen. It is not written to HighLevel yet.</span>
        </p>
        <p className={`fd-lerr fd-ste${err ? "" : " is-off"}`} id="fd-st-err" role="alert">
          <svg width="16" height="16" {...svgProps}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.3" /></svg>
          <span><span className="fd-h">{err?.message ?? ""}</span></span>
        </p>

        {filter.sections.biz ? (
          <section className="fd-pnl fd-in" style={{ "--i": 1 } as React.CSSProperties} aria-labelledby="fd-st-1">
            <h2 className="fd-pnh" id="fd-st-1">Business details</h2>
            <p className="fd-pns">Folder 01_Business_essentials. Your website and your texts read the same values. A change here changes them too.</p>
            <div className="fd-cvg">{bizFields.map((f) => <ValueField key={f.key} {...fieldProps(f)} />)}</div>
          </section>
        ) : null}

        {filter.sections.colors ? (
          <section className="fd-pnl fd-in" style={{ "--i": 2 } as React.CSSProperties} aria-labelledby="fd-st-2">
            <h2 className="fd-pnh" id="fd-st-2">Brand colors</h2>
            <p className="fd-pns">Folder 02_Branding. Four groups. Type a color like #2E7D32 and press Save changes. The swatches show the saved colors.</p>
            <button
              type="button"
              className="fd-btn is-plain fd-cvt"
              aria-expanded={state.cols}
              aria-controls="fd-st-col"
              onClick={() => dispatch({ type: "toggleCols" })}
            >
              <span className="fd-h">{state.cols ? "Hide the color fields" : "Change the brand colors"}</span>
            </button>
            <div className={`fd-cvg${state.cols ? "" : " is-off"}`} id="fd-st-col">
              {COLOR_GROUPS.map((g) => {
                const fields = g.fields.filter((f) => show(`cv-${f.key}`));
                if (!fields.length) return null;
                return [
                  <h3 className="fd-cgh" key={`h-${g.heading}`}>{g.heading}</h3>,
                  ...fields.map((f) => <ValueField key={f.key} {...fieldProps(f)} swatch />),
                ];
              })}
            </div>
          </section>
        ) : null}

        {filter.sections.biz || filter.sections.colors ? (
          <div className="fd-cvsv fd-in" style={{ "--i": 3 } as React.CSSProperties}>
            <button type="button" className="fd-btn is-fill fd-lgo fd-cvs" onClick={() => dispatch({ type: "save" })}>Save changes</button>
            <p className="fd-pns fd-hint">The names of the keys never change. Only their values do.</p>
          </div>
        ) : null}

        {filter.sections.conn ? (
          <section className="fd-stsec fd-in" style={{ "--i": 4 } as React.CSSProperties} aria-labelledby="fd-st-4">
            <h2 className="fd-pnh" id="fd-st-4">Connections</h2>
            <p className="fd-pns fd-sts">What is linked to your dashboard. A row that is not connected shows its steps.</p>
            <div className="fd-lst">
              {CONNECTIONS.map((c, i) => {
                if (!show(`conn-${i}`)) return null;
                const st = MOCK_CONNECTION_STATUS[i];
                const on = st.connected;
                const open = !on || !!state.how[i];
                return (
                  <div className="fd-rw" key={c.name}>
                    <div className="fd-rm">
                      <div className="fd-rbx">
                        <p className="fd-rn">{c.name}</p>
                        <p className="fd-rsb">
                          {i === 0 ? <><span className="fd-h">{values.business_phone_number}</span>. </> : null}
                          {c.sub}
                        </p>
                      </div>
                    </div>
                    <div className="fd-rac">
                      <span className={`fd-chip ${on ? "is-ok" : "is-plain"}`}>
                        <ChipIcons />
                        <span className="fd-h">{on ? (st.note ?? "Connected") : "Not connected"}</span>
                      </span>
                      <button
                        type="button"
                        className={`fd-btn is-plain${on ? "" : " is-off"}`}
                        aria-expanded={open}
                        onClick={() => dispatch({ type: "how", index: i })}
                      >
                        <span className="fd-h">{state.how[i] ? "Hide" : "How it works"}</span>
                      </button>
                    </div>
                    {on && st.a2pVerified ? (
                      <div className="fd-rex fd-trust">
                        <p className="fd-trh">
                          <svg width="15" height="15" {...svgProps} strokeWidth={2.4}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                          A2P verified. Your texts get delivered.
                        </p>
                      </div>
                    ) : null}
                    <div className={`fd-rex fd-how${open ? "" : " is-off"}`}>
                      <p className="fd-hneed"><b>You need:</b> {c.need}</p>
                      <ol className="fd-steps">{c.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                      <p className="fd-pns fd-hint">Done when this row says Connected.</p>
                      {!on ? (
                        state.asked[i] ? (
                          <p className="fd-pns fd-hint" role="status">Thank you. Forge Forward got your request and will connect it.</p>
                        ) : (
                          <button type="button" className="fd-btn" onClick={() => dispatch({ type: "ask", index: i })}>
                            Ask Forge Forward to connect
                          </button>
                        )
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {showSt2 ? (
          <div className="fd-cols fd-st2 fd-in" style={{ "--i": 5 } as React.CSSProperties}>
            {filter.sections.choice ? (
              <section aria-labelledby="fd-st-3">
                <h2 className="fd-pnh" id="fd-st-3">Your choices</h2>
                <p className="fd-pns fd-sts">Each switch works at once.</p>
                <div className="fd-lst">
                  {SWITCHES.map((label, i) =>
                    show(`sw-${i}`) ? (
                      <div className="fd-rw" key={label}>
                        <div className="fd-rm"><div className="fd-rbx"><p className="fd-rn">{label}</p></div></div>
                        <div className="fd-rac">
                          <button
                            type="button"
                            className={`fd-swb${state.sw[i] ? " is-on" : ""}`}
                            role="switch"
                            aria-checked={state.sw[i]}
                            aria-label={label}
                            onClick={() => dispatch({ type: "switch", index: i as 0 | 1 })}
                          >
                            <i aria-hidden="true" />
                            <span><span className="fd-h">{state.sw[i] ? "On" : "Off"}</span></span>
                          </button>
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
        ) : null}
      </div>
    </div>
  );
}
