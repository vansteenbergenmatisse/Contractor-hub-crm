import type { ReactNode } from "react";
import "./auth.css";

// The framed card of the design's sign-in screen (fd-login / fd-lcard). Before sign-in no tenant is
// known, so the brand block names the product; the tenant's own brand comes after sign-in.
export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="fd-app fd-login brand-scope">
      <main className="fd-lmain">
        <div className="fd-lcard fd-in" style={{ "--i": 0 } as React.CSSProperties}>
          <div className="fd-lbrand">
            <span className="fd-logo" aria-hidden="true">CH</span>
            <span className="fd-bt">
              <span className="fd-bname">Contractor Hub</span>
              <span className="fd-bsub">Your leads, quotes and invoices</span>
            </span>
          </div>
          <section className="fd-lv" aria-labelledby="auth-title">
            <h1 className="fd-lttl" id="auth-title">{title}</h1>
            {subtitle ? <p className="fd-lsub">{subtitle}</p> : null}
            {children}
          </section>
        </div>
      </main>
    </div>
  );
}
