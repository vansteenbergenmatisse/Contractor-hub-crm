import type { ReactNode } from "react";
import type { PageKey } from "@/features/app-shell";
import { Tile, type TileView } from "./Tile";

export type PageTile = TileView & { page: PageKey };

// `first` is the live New leads tile and `second` the live Appointments tile; the other tiles follow.
export function Tiles({ first, second, tiles, onOpen }: { first: ReactNode; second?: ReactNode; tiles: readonly PageTile[]; onOpen: (page: PageKey) => void }) {
  const offset = second ? 2 : 1;
  return (
    <section className="fd-tiles" aria-label="Today at a glance">
      {first}
      {second}
      {tiles.map((tile, index) => <Tile key={tile.page} tile={tile} index={index + offset} onOpen={() => onOpen(tile.page)} />)}
    </section>
  );
}
