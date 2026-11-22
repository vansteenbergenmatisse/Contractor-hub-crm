import type { PageKey } from "@/features/app-shell";
import { Glyph } from "./Glyph";

export type TileView = {
  page: PageKey;
  label: string;
  value: number;
  unit?: string;
  sub: string;
  aria: string;
};

export function Tiles({ tiles, onOpen }: { tiles: readonly TileView[]; onOpen: (page: PageKey) => void }) {
  return (
    <section className="fd-tiles" aria-label="Today at a glance">
      {tiles.map((tile, index) => (
        <button key={tile.page} type="button" className="fd-tile fd-in" style={{ "--i": index + 1 } as React.CSSProperties} aria-label={tile.aria} onClick={() => onOpen(tile.page)}>
          <span className="fd-tl">{tile.label}</span>
          <span className="fd-tv"><b>{tile.value}</b>{tile.unit ? <span>{tile.unit}</span> : null}</span>
          <span className="fd-ts">{tile.sub}</span>
          <span className="fd-tc" aria-hidden="true"><Glyph name="chevron" size={16} /></span>
        </button>
      ))}
    </section>
  );
}
