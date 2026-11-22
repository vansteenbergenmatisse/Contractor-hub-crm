import { describe, expect, it } from "vitest";
import {
  MOCK_CARDS,
  MOCK_HIDDEN_COUNTS,
  STAGES,
  boardReducer,
  canUndo,
  cardView,
  computeLayout,
  groupCounts,
  initialBoard,
  loseCard,
  moveCard,
  needsPrice,
  pickStage,
  stageCounts,
  stubView,
  undoMove,
} from "@/features/pipeline";

const fresh = () => initialBoard(MOCK_CARDS);
const idx = (name: string) => MOCK_CARDS.findIndex((c) => c.name === name);

describe("initial board", () => {
  it("starts every card in its stage, on New Lead, showing the list", () => {
    const s = fresh();
    expect(s.sg).toEqual(MOCK_CARDS.map((c) => c.stage));
    expect(s.stg).toBe(0);
    expect(s.open).toBe(false);
    expect(s.last).toBeNull();
  });

  it("counts cards per stage, with the cards the board does not draw", () => {
    const counts = stageCounts(fresh(), MOCK_HIDDEN_COUNTS);
    expect(counts).toHaveLength(11);
    expect(counts[0]).toBe(3);
    expect(counts[7]).toBe(0);
    expect(counts[9]).toBe(5 + 37);
    expect(counts[10]).toBe(4 + 3);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(MOCK_CARDS.length + 40);
    expect(groupCounts(counts)).toEqual([
      counts[0] + counts[1] + counts[2] + counts[3] + counts[4],
      counts[5] + counts[6] + counts[7],
      counts[8],
      counts[9] + counts[10],
    ]);
  });

  it("counts follow a move", () => {
    const i = idx("Maria Alvarez");
    const s = moveCard(fresh(), i, 2);
    const counts = stageCounts(s, MOCK_HIDDEN_COUNTS);
    expect(counts[0]).toBe(2);
    expect(counts[2]).toBe(5);
  });
});

describe("main buttons", () => {
  it("every stage's main button moves the card to the table's target", () => {
    for (const stage of STAGES) {
      const i = MOCK_CARDS.findIndex((c) => c.stage === stage.index);
      if (i < 0) continue; // Job Done starts empty; covered below
      const s = fresh();
      const view = cardView(s, MOCK_CARDS, i);
      const moved = moveCard(s, i, view.primary.to);
      expect(moved.sg[i]).toBe(stage.button.to);
    }
  });

  it("Quote to Send: Send quote when the quote is ready, Add price when it is not", () => {
    const s = fresh();
    const ready = cardView(s, MOCK_CARDS, idx("Derek Olsen"));
    const need = cardView(s, MOCK_CARDS, idx("Priya Shah"));
    expect(ready.primary).toEqual({ label: "Send quote", kind: "send-quote", to: 4 });
    expect(ready.seeQuote).toBe(true);
    expect(need.primary.kind).toBe("add-price");
    expect(need.seeQuote).toBe(false);
    expect(need.timeText).toBe("Needs service and price");
    expect(need.autoText).toBe("The AI builds the quote after that");
    expect(needsPrice(MOCK_CARDS[idx("Derek Olsen")])).toBe(false);
  });

  it("Job Done: the Invoice button opens the send timer (kind send-invoice)", () => {
    const i = idx("Maria Alvarez");
    const s = moveCard(fresh(), i, 7);
    expect(cardView(s, MOCK_CARDS, i).primary).toEqual({ label: "Invoice", kind: "send-invoice", to: 8 });
  });
});

describe("Job done shortcut", () => {
  it("jumps from every stage before Job Done straight to Job Done", () => {
    for (let k = 0; k < 7; k++) {
      let s = fresh();
      const i = MOCK_CARDS.findIndex((c) => c.stage === k);
      if (i < 0) continue;
      const view = cardView(s, MOCK_CARDS, i);
      const to = view.second ? view.second.to : view.primary.to;
      s = moveCard(s, i, to);
      expect(s.sg[i]).toBe(7);
    }
  });

  it("works from a card that was moved into each stage, and Undo puts it back", () => {
    const i = idx("Maria Alvarez");
    for (let k = 0; k < 7; k++) {
      const s = k === MOCK_CARDS[i].stage ? fresh() : moveCard(fresh(), i, k);
      const from = s.sg[i];
      const second = cardView(s, MOCK_CARDS, i).second;
      const to = second ? second.to : STAGES[from].button.to;
      const jumped = moveCard(s, i, to);
      expect(jumped.sg[i]).toBe(7);
      const back = undoMove(jumped);
      expect(back.sg[i]).toBe(from);
      expect(back.stg).toBe(from);
    }
  });
});

describe("moves, the marker and Undo", () => {
  it("a moved card lands on top of its new stage with a ring", () => {
    const a = idx("Hannah Brooks");
    const b = idx("Jordan Reyes");
    let s = moveCard(fresh(), a, 2);
    expect(computeLayout(s).rank[a]).toBe(0);
    expect(cardView(s, MOCK_CARDS, a).className).toMatch(/is-new-[ab]/);
    s = moveCard(s, b, 2);
    expect(computeLayout(s).rank[b]).toBe(0);
    expect(computeLayout(s).rank[a]).toBe(1);
  });

  it("leaves a marker in the old place, with where it went, what happens next, Show and Undo", () => {
    const i = idx("Maria Alvarez");
    const before = computeLayout(fresh());
    const s = moveCard(fresh(), i, 2);
    const stub = stubView(s, MOCK_CARDS);
    expect(stub.className).toContain("is-s0");
    expect(stub.className).toContain(`is-r${before.rank[i]}`);
    expect(stub.className).not.toContain("is-off");
    expect(stub.name).toBe("Maria Alvarez");
    expect(stub.to).toBe("Estimate Booked");
    expect(stub.auto).toBe("Reminder texts go out");
    // Sales to Sales: Show is the same group (the CSS hides it on a computer).
    expect(stub.showClassName).toContain("is-same");
    expect(cardView(s, MOCK_CARDS, i).showUndo).toBe(true);
    expect(stubView(moveCard(fresh(), i, 7), MOCK_CARDS).showClassName).not.toContain("is-same");
  });

  it("Undo restores the stage and the order and removes the marker", () => {
    const i = idx("Maria Alvarez");
    const start = fresh();
    const s = undoMove(moveCard(start, i, 2));
    expect(s.sg).toEqual(start.sg);
    expect(s.seq).toEqual(start.seq);
    expect(stubView(s, MOCK_CARDS).className).toContain("is-off");
    expect(canUndo(s)).toBe(false);
    expect(undoMove(s)).toBe(s);
  });

  it("does nothing when a card moves to its own stage", () => {
    const s = fresh();
    expect(moveCard(s, 0, s.sg[0])).toBe(s);
  });

  it("Show opens the stage the card went to", () => {
    const s = pickStage(moveCard(fresh(), 0, 2), 2, true);
    expect(s.stg).toBe(2);
    expect(s.open).toBe(true);
  });

  it("a card moved by a send has no Undo", () => {
    const i = idx("Derek Olsen");
    const s = boardReducer(fresh(), { type: "move", i, to: 4, bySend: true });
    expect(s.sg[i]).toBe(4);
    expect(canUndo(s)).toBe(false);
    expect(undoMove(s)).toBe(s);
    expect(cardView(s, MOCK_CARDS, i).showUndo).toBe(false);
    expect(stubView(s, MOCK_CARDS).className).toContain("is-nou");
    // A normal move after it can be undone again.
    const t = moveCard(s, 0, 2);
    expect(canUndo(t)).toBe(true);
  });
});

describe("the reasons", () => {
  it("Ask again later goes to Check Back Later and stores no reason", () => {
    const i = idx("Maria Alvarez");
    const s = loseCard(fresh(), i, "later");
    expect(s.sg[i]).toBe(9);
    expect(s.rs[i]).toBeUndefined();
  });

  it.each(["Said no", "Chose a competitor", "Not a fit", "Opted out"] as const)("%s goes to Lost and stores the reason", (reason) => {
    const i = idx("Maria Alvarez");
    const s = loseCard(fresh(), i, reason);
    expect(s.sg[i]).toBe(10);
    expect(s.rs[i]).toBe(reason);
    expect(cardView(s, MOCK_CARDS, i).timeText).toBe(reason);
    const undone = undoMove(s);
    expect(undone.sg[i]).toBe(0);
    expect(undone.rs[i]).toBeUndefined();
  });

  it("no trash on Payment Due and Lost cards, trash everywhere else", () => {
    const s = fresh();
    for (let i = 0; i < MOCK_CARDS.length; i++) {
      const st = s.sg[i];
      expect(cardView(s, MOCK_CARDS, i).trash).toBe(st !== 8 && st !== 10);
    }
  });
});

describe("stage tags", () => {
  const view = (name: string, to?: number) => {
    const i = idx(name);
    const s = to === undefined ? fresh() : moveCard(fresh(), i, to);
    return cardView(s, MOCK_CARDS, i);
  };

  it("Quote Sent says whether the customer opened the quote", () => {
    expect(view("Harlan Realty").tags[0]?.text).toBe("Not opened yet");
    expect(view("Raj Patel").tags[0]).toEqual({ cls: "is-warn", text: "Opened 3 times" });
    expect(view("Mark Jensen").tags[0]).toEqual({ cls: "is-ok", text: "Opened" });
    expect(view("Maria Alvarez", 4).tags[0]?.text).toBe("Not opened yet");
  });

  it("Job to Schedule says Accepted", () => {
    expect(view("Brian Cole").tags[0]).toEqual({ cls: "is-ok", text: "Accepted" });
  });

  it("Job Done says first-time or returning and whether there is a review", () => {
    const v = view("Maria Alvarez", 7);
    expect(["First-time customer", "Returning customer"]).toContain(v.tags[0]?.text);
    expect(["Left a review", "No review yet"]).toContain(v.tags[1]?.text);
  });

  it("Payment Due shows days late: amber, light red, full red", () => {
    expect(view("Bright Daycare").tags[0]).toEqual({ cls: "is-hot", text: "14 days late" });
    expect(view("Grace Whitfield").tags[0]).toEqual({ cls: "is-bad", text: "6 days late" });
    expect(view("Paul Ortega").tags[0]?.cls).toBe("is-warn");
    expect(view("Maria Alvarez", 8).tags[0]).toEqual({ cls: "is-warn", text: "Due in 7 days" });
  });

  it("other stages have no tags", () => {
    expect(view("Maria Alvarez").tags).toEqual([null, null]);
  });
});

describe("stage view", () => {
  it("picks a stage and the group changes when it crosses a group", () => {
    const s = pickStage(fresh(), 8, true);
    expect(s.stg).toBe(8);
    expect(s.gch).toBe(true);
    expect(pickStage(s, 8, true)).toBe(s);
    expect(pickStage(s, -1)).toBe(s);
    expect(pickStage(s, 11)).toBe(s);
    expect(pickStage(fresh(), 3).gch).toBe(false);
  });

  it("back to the list keeps the stage", () => {
    const s = boardReducer(pickStage(fresh(), 4, true), { type: "list" });
    expect(s.open).toBe(false);
    expect(s.stg).toBe(4);
  });
});
