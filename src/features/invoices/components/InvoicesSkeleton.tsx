import type { CSSProperties } from "react";

const bar = (width: string, height = 12): CSSProperties => ({
  display: "block", width, height, borderRadius: 6, background: "currentColor", opacity: 0.1,
});

// Shown while a billing page loads: bars in place of any value.
export function InvoicesSkeleton({ title = "Invoices" }: { title?: string }) {
  return (
    <div className="fd-dv">
      <section className="fd-phd fd-in"><h1 className="fd-pt">{title}</h1></section>
      <div className="fd-in" role="status" aria-busy="true" aria-label={`Loading ${title.toLowerCase()}`}>
        <div aria-hidden="true" style={{ display: "grid", gap: 12, padding: 16 }}>
          <span style={bar("40%", 18)} />
          {[0, 1, 2, 3].map((n) => <span key={n} style={bar("100%", 44)} />)}
        </div>
      </div>
    </div>
  );
}
