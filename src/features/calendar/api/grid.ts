import { GRID_ROWS } from "./dates";

// Pointer maths for the computer week grid (drag a stop, double-click a free time). Pure, so it
// can be tested without a browser. `cols` are the grid's column widths in px; the first column
// holds the hour labels.

// The day (0 to 6) under an x position, or -1 when the point is over the hour labels or outside.
export function dayAtX(x: number, left: number, cols: readonly number[]): number {
  let rest = x - left - (cols[0] ?? 0);
  if (rest < 0) return -1;
  for (let k = 1; k <= 7 && k < cols.length; k += 1) {
    if (rest < cols[k]) return k - 1;
    rest -= cols[k];
  }
  return -1;
}

// The half-hour row (0 based) under a y position, kept inside the grid.
export const slotAtY = (y: number, top: number, rowH: number): number => Math.max(0, Math.min(GRID_ROWS - 1, Math.floor((y - top) / rowH)));

// Where a dragged stop lands: its top edge snaps to the nearest row, and it stays inside the grid.
export const dropStart = (stopTop: number, gridTop: number, rowH: number, len: number): number =>
  Math.max(0, Math.min(GRID_ROWS - len, Math.round((stopTop - gridTop) / rowH)));
