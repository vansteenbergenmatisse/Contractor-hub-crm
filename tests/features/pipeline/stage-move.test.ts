import { describe, expect, it } from "vitest";
import { MOCK_CARDS, boardReducer, initialBoard } from "@/features/pipeline";
import { canMoveManually, groupAtPoint, moveAnnouncement, planStageMove, stageAtPoint, stageChange, stageOptions } from "../../../src/features/pipeline/api/stage-move";

const board = () => initialBoard(MOCK_CARDS);

describe("stageOptions", () => {
  it("lists every other stage, in order", () => {
    expect(stageOptions(0).map((o) => o.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("Quote Sent and Payment Due are unavailable, with the button that gets there", () => {
    const options = stageOptions(0);
    expect(options.find((o) => o.index === 4)?.blocked).toBe("Use Send quote");
    expect(options.find((o) => o.index === 8)?.blocked).toBe("Use Invoice");
    expect(options.filter((o) => o.blocked).map((o) => o.index)).toEqual([4, 8]);
  });

  it("a card in Payment Due has no manual targets", () => {
    expect(canMoveManually(8)).toBe(false);
    expect(stageOptions(8)).toEqual([]);
  });

  it("a card in Quote Sent can leave by hand", () => {
    expect(canMoveManually(4)).toBe(true);
    expect(stageOptions(4).map((o) => o.index)).not.toContain(4);
  });
});

describe("planStageMove", () => {
  it("a normal stage is a move with Undo", () => {
    expect(planStageMove(board(), 0, 5)).toEqual({ type: "move", action: { type: "move", i: 0, to: 5 } });
  });

  it("the card's own stage does nothing", () => {
    expect(planStageMove(board(), 0, board().sg[0])).toEqual({ type: "none" });
  });

  it("Lost asks for the reason first", () => {
    expect(planStageMove(board(), 0, 10)).toEqual({ type: "ask-reason" });
  });

  it("Quote Sent and Payment Due are never reached by hand", () => {
    expect(planStageMove(board(), 0, 4)).toEqual({ type: "none" });
    expect(planStageMove(board(), 0, 8)).toEqual({ type: "none" });
  });

  it("a card in Payment Due cannot be moved by hand to any stage", () => {
    const i = board().sg.indexOf(8);
    for (let to = 0; to <= 10; to++) expect(planStageMove(board(), i, to)).toEqual({ type: "none" });
  });

  it("a stage that does not exist does nothing", () => {
    expect(planStageMove(board(), 0, 11)).toEqual({ type: "none" });
    expect(planStageMove(board(), 0, -1)).toEqual({ type: "none" });
  });
});

describe("stageChange (what Phase 3 sends to the CRM)", () => {
  it("names the card and new stage of a manual move", () => {
    expect(stageChange(board(), { type: "move", i: 0, to: 5 })).toEqual({ i: 0, to: 5, undone: false, via: "manual" });
  });

  it("marks a move made by a send", () => {
    expect(stageChange(board(), { type: "move", i: 0, to: 4, bySend: true })).toEqual({ i: 0, to: 4, undone: false, via: "send" });
  });

  it("names the old stage for an Undo", () => {
    const moved = boardReducer(board(), { type: "move", i: 0, to: 5 });
    expect(stageChange(moved, { type: "undo" })).toEqual({ i: 0, to: 0, undone: true, via: "manual" });
  });

  it("a Lost reason lands on Lost, and Ask again later on Check Back Later", () => {
    expect(stageChange(board(), { type: "lose", i: 0, reason: "later" })).toEqual({ i: 0, to: 9, undone: false, via: "manual" });
    expect(stageChange(board(), { type: "lose", i: 0, reason: "Went with someone else" as never })).toEqual({ i: 0, to: 10, undone: false, via: "manual" });
  });

  it("is null when nothing changes stage", () => {
    expect(stageChange(board(), { type: "move", i: 0, to: board().sg[0] })).toBeNull();
    expect(stageChange(board(), { type: "undo" })).toBeNull();
    expect(stageChange(board(), { type: "pick", k: 3 })).toBeNull();
  });

  it("is null for an Undo of a move made by a send", () => {
    const sent = boardReducer(board(), { type: "move", i: 0, to: 4, bySend: true });
    expect(stageChange(sent, { type: "undo" })).toBeNull();
  });
});

describe("moveAnnouncement", () => {
  it("says who moved where", () => {
    expect(moveAnnouncement("Maria Alvarez", 4, false)).toBe("Maria Alvarez moved to Quote Sent.");
  });
  it("says when a move was undone", () => {
    expect(moveAnnouncement("Maria Alvarez", 0, true)).toBe("Undone. Maria Alvarez is back in New Lead.");
  });
});

describe("stageAtPoint", () => {
  const cols = [
    { stage: 0, left: 100, right: 200 },
    { stage: 1, left: 200, right: 300 },
    { stage: 2, left: 0, right: 0 },
  ];
  it("finds the column under the pointer", () => {
    expect(stageAtPoint(150, cols)).toBe(0);
    expect(stageAtPoint(200, cols)).toBe(1);
  });
  it("is -1 outside every column, and a hidden column never matches", () => {
    expect(stageAtPoint(50, cols)).toBe(-1);
    expect(stageAtPoint(300, cols)).toBe(-1);
    expect(stageAtPoint(0, cols)).toBe(-1);
  });
});

describe("groupAtPoint", () => {
  const tabs = [
    { left: 0, right: 100, top: 0, bottom: 40 },
    { left: 100, right: 200, top: 0, bottom: 40 },
    { left: 0, right: 0, top: 0, bottom: 0 },
  ];
  it("finds the group tab under the pointer", () => {
    expect(groupAtPoint(150, 20, tabs)).toBe(1);
  });
  it("is -1 off the tabs, and a hidden tab never matches", () => {
    expect(groupAtPoint(150, 60, tabs)).toBe(-1);
    expect(groupAtPoint(0, 0, [tabs[2]])).toBe(-1);
  });
});
