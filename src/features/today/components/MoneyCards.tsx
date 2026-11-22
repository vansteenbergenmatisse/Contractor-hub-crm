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

const CARDS = [["fd-m1", "Booked this week", 8], ["fd-m2", "Quotes out", 9], ["fd-m3", "Money owed", 10]] as const;
const rise = (i: number) => ({ "--i": i }) as CSSProperties;

// No `data` (no real source yet): the three cards keep their place and title and show no value.
export function MoneyCards({ data, now }: { data?: MoneyData; now?: Date } = {}) {
  if (!data) {
    return (
      <div className="fd-money">
        {CARDS.map(([id, title, i]) => (
          <section key={id} className="fd-card fd-in" style={rise(i)} aria-labelledby={id}>
            <MoneyHead id={id} title={title} />
            <p className="fd-mf"><NotAvailableChip /></p>
          </section>
        ))}
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
