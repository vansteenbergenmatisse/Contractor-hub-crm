import type { CSSProperties } from "react";

const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

// Page content for a page that has no real data yet. It uses the page header and the
// "Not available yet" row from Settings, and renders inside the shell's page container.
export function NotAvailablePage({ title }: { title: string }) {
  return (
    <>
      <section className="fd-phd fd-in" style={stagger(0)}>
        <h1 className="fd-pt">{title}</h1>
        <p className="fd-pw">We do not have this page yet.</p>
      </section>
      <div className="fd-lst fd-in" style={stagger(1)}>
        <div className="fd-rw">
          <div className="fd-rm"><div className="fd-rbx"><p className="fd-rn">{title}</p></div></div>
          <div className="fd-rac"><span className="fd-chip is-plain">Not available yet</span></div>
        </div>
      </div>
    </>
  );
}
