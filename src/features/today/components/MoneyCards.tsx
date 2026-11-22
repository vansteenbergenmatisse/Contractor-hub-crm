import { BOOKED, MONEY_OWED, QUOTES_OUT } from "../mock";
import type { MiniRow } from "../types";
import { Chip } from "./Chip";
import { Glyph } from "./Glyph";

function Mini({ rows }: { rows: readonly MiniRow[] }) {
  return (
    <ul className="fd-mini">
      {rows.map((row) => (
        <li key={row.name}>
          <span className="fd-mn">{row.name}</span>
          {row.late ? <Chip tone="bad" icon="alert">{row.late}</Chip> : <span className="fd-mq">{row.note}</span>}
          <span className="fd-ma">{row.amount}</span>
        </li>
      ))}
    </ul>
  );
}

function Head({ id, title }: { id: string; title: string }) {
  return <div className="fd-mh"><h2 className="fd-ml" id={id}>{title}</h2><Glyph name="chevron" size={15} /></div>;
}

export function MoneyCards() {
  return (
    <div className="fd-money">
      <section className="fd-card fd-fill fd-in" style={{ "--i": 8 } as React.CSSProperties} aria-labelledby="fd-m1">
        <Head id="fd-m1" title="Booked this week" />
        <p className="fd-mv">{BOOKED.total}</p>
        <p className="fd-up"><Glyph name="trend" size={15} />{BOOKED.trend}</p>
        <div className="fd-bars" role="img" aria-label={BOOKED.aria}>
          {BOOKED.bars.map((bar, index) => (
            <span key={bar.label} className={`fd-bb${bar.on ? " is-on" : ""}`}><i style={{ height: `${bar.height}%`, "--b": index } as React.CSSProperties} /><em>{bar.label}</em></span>
          ))}
        </div>
      </section>
      <section className="fd-card fd-in" style={{ "--i": 9 } as React.CSSProperties} aria-labelledby="fd-m2">
        <Head id="fd-m2" title="Quotes out" />
        <p className="fd-mv">{QUOTES_OUT.total}</p>
        <Mini rows={QUOTES_OUT.rows} />
        <p className="fd-mf">{QUOTES_OUT.foot}</p>
      </section>
      <section className="fd-card fd-in" style={{ "--i": 10 } as React.CSSProperties} aria-labelledby="fd-m3">
        <Head id="fd-m3" title="Money owed" />
        <p className="fd-mv">{MONEY_OWED.total}</p>
        <Mini rows={MONEY_OWED.rows} />
        <p className="fd-mf">{MONEY_OWED.foot}</p>
      </section>
    </div>
  );
}
