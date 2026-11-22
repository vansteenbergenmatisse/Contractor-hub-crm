import type { StageChange } from "./stage-move";

// THE seam for Phase 3. Every change of a card's stage on the board passes through here once: a
// button, a drag, the stage sheet, a Lost reason, a finished send and an Undo. Phase 3 changes the
// opportunity's stage in HighLevel from this point; HighLevel's workflows do the rest, and this app
// sends nothing itself. In Phase 2 it does nothing: the board's state is mock and stays on screen.
export function syncStageMove(change: StageChange): void {
  void change;
}
