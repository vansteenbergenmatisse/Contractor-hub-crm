import { Fragment, type ReactNode } from "react";
import type { PageKey } from "@/features/app-shell";
import { Tile, type TileView } from "./Tile";

export type PageTile = TileView & { page: PageKey };

// `first` is the live New leads tile and `second` the live Appointments tile; the other tiles follow.
// A page with a server slot in `live` shows that slot in the tile's place.
export function Tiles({ first, second, tiles, live, onOpen }: { first: ReactNode; second?: ReactNode; tiles: readonly PageTile[]; live?: Partial<Record<PageKey, ReactNode>>; onOpen: (page: PageKey) => void }) {
  const offset = second ? 2 : 1;
  return (
    <section className="fd-tiles" aria-label="Today at a glance">
      {first}
      {second}
      {tiles.map((tile, index) => live?.[tile.page]
        ? <Fragment key={tile.page}>{live[tile.page]}</Fragment>
        : <Tile key={tile.page} tile={tile} index={index + offset} onOpen={() => onOpen(tile.page)} />)}
    </section>
  );
}
