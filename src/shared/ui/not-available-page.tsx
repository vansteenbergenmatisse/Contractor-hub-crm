import Link from "next/link";
import type { CSSProperties } from "react";

const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

// Page content for a page that has no real data yet. It uses the page header and the
// "Not available yet" chip from Settings, and renders inside the shell's page container.
export function NotAvailablePage({ title }: { title: string }) {
  return (
    <section className="fd-phd fd-in" style={stagger(0)}>
      <h1 className="fd-pt">{title}</h1>
      <p className="fd-pw"><span className="fd-chip is-plain">Not available yet</span></p>
      <div style={{ marginTop: 16 }}>
        <Link className="fd-btn is-plain" href="/leads" style={{ textDecoration: "none" }}>See your leads</Link>
      </div>
    </section>
  );
}
