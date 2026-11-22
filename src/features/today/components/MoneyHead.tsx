import { Glyph } from "./Glyph";

// A money card's title with its chevron.
export function MoneyHead({ id, title }: { id: string; title: string }) {
  return <div className="fd-mh"><h2 className="fd-ml" id={id}>{title}</h2><Glyph name="chevron" size={15} /></div>;
}
