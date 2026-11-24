"use client";

import type { CSSProperties } from "react";
import { useClientNow } from "../hooks/use-client-now";
import type { MiniRow, MoneyBar } from "../types";
import { Glyph } from "./Glyph";
import { MiniList } from "./MiniList";
import { MoneyHead } from "./MoneyHead";
import { NotAvailableChip } from "./NotAvailableChip";

export type MoneyData = {
  booked: { total: string; trend: string; aria: string; bars: readonly MoneyBar[] };
  quotes: { total: string; rows: readonly MiniRow[]; foot: string };
  owed: { total: string; foot: string; rowsAt: (now: Date | null) => MiniRow[] };
};

const TITLES = ["Booked this week", "Quotes out", "Money owed"] as const;
const rise = (i: number) => ({ "--i": i }) as CSSProperties;

// Proven counts from the real reads. Null: not proven. Amounts stay out until their unit is known.
export type MoneyCounts = { booked: number | null; quotes: number | null; owed: number | null };
const COUNT_TEXT: readonly ((count: number) => string)[] = [
  (n) => `${n} ${n === 1 ? "appointment" : "appointments"}`,
  (n) => `${n} sent`,
  (n) => `${n} ${n === 1 ? "invoice" : "invoices"}`,
];

// No `data` (no real source yet): one compact list keeps the three titles and shows no value, or the
// proven `counts`. `busy`: still loading, so no chip claims anything yet.
export function MoneyCards({ data, now, counts, busy }: { data?: MoneyData; now?: Date; counts?: MoneyCounts; busy?: boolean } = {}) {
  if (!data) {
    const values = counts ? [counts.booked, counts.quotes, counts.owed] : [null, null, null];
    return (
      <div className="fd-money" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
        <section className="fd-lst fd-in" style={rise(8)} aria-label="Money" aria-busy={busy || undefined}>
          {TITLES.map((title, index) => (
            <div key={title} className="fd-rw">
              <div className="fd-rm"><div className="fd-rbx"><h2 className="fd-rn">{title}</h2></div></div>
              <div className="fd-rac">
                {busy ? null : values[index] === null ? <NotAvailableChip /> : <span className="fd-chip is-plain">{COUNT_TEXT[index](values[index])}</span>}
              </div>
            </div>
          ))}
        </section>
      </div>
    );
  }
  return <MoneyValues data={data} now={now} />;
}

function MoneyValues({ data: { booked, quotes, owed }, now: fixed }: { data: MoneyData; now?: Date }) {
  // Null on the server and while hydrating, so due days never differ between the server's and the
  // browser's time zone: they show right after hydration.
  const now = useClientNow(fixed);
  return (
    <div className="fd-money">
      <section className="fd-card fd-fill fd-in" style={rise(8)} aria-labelledby="fd-m1">
        <MoneyHead id="fd-m1" title="Booked this week" />
        <p className="fd-mv">{booked.total}</p>
        <p className="fd-up"><Glyph name="trend" size={15} />{booked.trend}</p>
        <div className="fd-bars" role="img" aria-label={booked.aria}>
          {booked.bars.map((bar, index) => (
            <span key={bar.label} className={`fd-bb${bar.on ? " is-on" : ""}`}><i style={{ height: `${bar.height}%`, "--b": index } as CSSProperties} /><em>{bar.label}</em></span>
          ))}
        </div>
      </section>
      <section className="fd-card fd-in" style={rise(9)} aria-labelledby="fd-m2">
        <MoneyHead id="fd-m2" title="Quotes out" />
        <p className="fd-mv">{quotes.total}</p>
        <MiniList rows={quotes.rows} />
        <p className="fd-mf">{quotes.foot}</p>
      </section>
      <section className="fd-card fd-in" style={rise(10)} aria-labelledby="fd-m3">
        <MoneyHead id="fd-m3" title="Money owed" />
        <p className="fd-mv">{owed.total}</p>
        <MiniList rows={owed.rowsAt(now)} />
        <p className="fd-mf">{owed.foot}</p>
      </section>
    </div>
  );
}
