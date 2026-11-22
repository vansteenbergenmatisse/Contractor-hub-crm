import type { CSSProperties } from "react";
import { Glyph } from "./Glyph";
import { NotAvailableChip } from "./NotAvailableChip";

export type TileView = {
  label: string;
  // Null: no proven number, so none is shown.
  value: number | null;
  unit?: string;
  sub: string;
  aria: string;
  busy?: boolean;
};

export function Tile({ tile, index, onOpen }: { tile: TileView; index: number; onOpen: () => void }) {
  return (
    <button type="button" className="fd-tile fd-in" style={{ "--i": index + 1 } as CSSProperties} aria-label={tile.aria} aria-busy={tile.busy || undefined} onClick={onOpen}>
      <span className="fd-tl">{tile.label}</span>
      {tile.value === null
        ? <span className="fd-tv">{tile.busy ? null : <NotAvailableChip />}</span>
        : <span className="fd-tv"><b>{tile.value}</b>{tile.unit ? <span>{tile.unit}</span> : null}</span>}
      <span className="fd-ts">{tile.sub}</span>
      <span className="fd-tc" aria-hidden="true"><Glyph name="chevron" size={16} /></span>
    </button>
  );
}
