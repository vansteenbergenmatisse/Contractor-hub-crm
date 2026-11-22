"use client";

import { owedRows } from "../api/selectors";
import { useClientNow } from "../hooks/use-client-now";
import { BOOKED, MONEY_OWED, QUOTES_OUT } from "../mock";
import { Glyph } from "./Glyph";
import { MiniList } from "./MiniList";
import { MoneyHead } from "./MoneyHead";

// `now` is for tests; the page passes nothing.
export function MoneyCards({ now: fixed }: { now?: Date } = {}) {
  // The same "today" the Invoices page dates its sample invoices from. Null on the server and while
  // hydrating, so the due days ("Due Nov 22", "6 days late") never differ between the server's and the
  // browser's time zone: they show right after hydration.
  const now = useClientNow(fixed);
  const owed = owedRows(MONEY_OWED.rows, now);
  return (
    <div className="fd-money">
      <section className="fd-card fd-fill fd-in" style={{ "--i": 8 } as React.CSSProperties} aria-labelledby="fd-m1">
        <MoneyHead id="fd-m1" title="Booked this week" />
        <p className="fd-mv">{BOOKED.total}</p>
        <p className="fd-up"><Glyph name="trend" size={15} />{BOOKED.trend}</p>
        <div className="fd-bars" role="img" aria-label={BOOKED.aria}>
          {BOOKED.bars.map((bar, index) => (
            <span key={bar.label} className={`fd-bb${bar.on ? " is-on" : ""}`}><i style={{ height: `${bar.height}%`, "--b": index } as React.CSSProperties} /><em>{bar.label}</em></span>
          ))}
        </div>
      </section>
      <section className="fd-card fd-in" style={{ "--i": 9 } as React.CSSProperties} aria-labelledby="fd-m2">
        <MoneyHead id="fd-m2" title="Quotes out" />
        <p className="fd-mv">{QUOTES_OUT.total}</p>
        <MiniList rows={QUOTES_OUT.rows} />
        <p className="fd-mf">{QUOTES_OUT.foot}</p>
      </section>
      <section className="fd-card fd-in" style={{ "--i": 10 } as React.CSSProperties} aria-labelledby="fd-m3">
        <MoneyHead id="fd-m3" title="Money owed" />
        <p className="fd-mv">{MONEY_OWED.total}</p>
        <MiniList rows={owed} />
        <p className="fd-mf">{MONEY_OWED.foot}</p>
      </section>
    </div>
  );
}
