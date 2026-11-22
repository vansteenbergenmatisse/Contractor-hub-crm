import type { ReactNode } from "react";
import type { SignInBrand } from "@/features/brand";
import { BrandLogo } from "@/shared/ui/brand-logo";
import "./auth.css";

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => [...word][0]).join("").toUpperCase();

// The framed card of the design's sign-in screen (fd-login / fd-lcard). Before sign-in no tenant is
// known, so the brand block names the product. A personal link (`brand`) shows that client's public
// branding instead; it changes only how this page looks.
export function AuthCard({ title, subtitle, brand, children }: { title: string; subtitle?: string; brand?: SignInBrand | null; children: ReactNode }) {
  const name = brand?.name ?? "Contractor Hub";
  return (
    <div className={`fd-app fd-login brand-scope${brand?.backgroundUrl ? " has-bg" : ""}`}>
      {/* Validated hex colors only (brandScopeCss). */}
      {brand?.css ? <style>{brand.css}</style> : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- client hosts are not in next/image config */}
      {brand?.backgroundUrl ? <img className="fd-lbg" src={brand.backgroundUrl} alt="" referrerPolicy="no-referrer" /> : null}
      <main className="fd-lmain">
        <div className="fd-lcard fd-in" style={{ "--i": 0 } as React.CSSProperties}>
          <div className="fd-lbrand">
            {brand ? <BrandLogo url={brand.logoUrl} initials={initials(name)} /> : <span className="fd-logo" aria-hidden="true">CH</span>}
            <span className="fd-bt">
              <span className="fd-bname">{name}</span>
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
