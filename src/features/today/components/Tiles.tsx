import type { ReactNode } from "react";
import type { PageKey } from "@/features/app-shell";
import { Tile, type TileView } from "./Tile";

export type PageTile = TileView & { page: PageKey };

// `first` is the live New leads tile; the other tiles follow it.
export function Tiles({ first, tiles, onOpen }: { first: ReactNode; tiles: readonly PageTile[]; onOpen: (page: PageKey) => void }) {
  return (
    <section className="fd-tiles" aria-label="Today at a glance">
      {first}
      {tiles.map((tile, index) => <Tile key={tile.page} tile={tile} index={index + 1} onOpen={() => onOpen(tile.page)} />)}
    </section>
  );
}
