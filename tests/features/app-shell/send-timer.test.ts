import { describe, expect, it } from "vitest";
import { markFired, SEND_SECONDS, setViewing, shouldFire, startTimer, tick } from "@/features/app-shell";

describe("send timer", () => {
  it("starts at 20 and counts down one second per tick", () => {
    let s = startTimer();
    expect(s.n).toBe(SEND_SECONDS);
    expect(SEND_SECONDS).toBe(20);
    s = tick(s);
    expect(s.n).toBe(19);
  });

  it("does not fire before 0", () => {
    let s = startTimer();
    for (let i = 0; i < 19; i += 1) s = tick(s);
    expect(s.n).toBe(1);
    expect(shouldFire(s)).toBe(false);
  });

  it("fires at 0, stops there, and fires only once", () => {
    let s = startTimer();
    for (let i = 0; i < 25; i += 1) s = tick(s);
    expect(s.n).toBe(0);
    expect(shouldFire(s)).toBe(true);
    s = markFired(s);
    expect(shouldFire(s)).toBe(false);
  });

  it("pauses while the document is shown and goes on after Back", () => {
    let s = tick(startTimer());
    s = setViewing(s, true);
    expect(tick(s).n).toBe(19);
    expect(tick(setViewing(s, false)).n).toBe(18);
  });

  it("does not fire while paused at 0", () => {
    let s = startTimer();
    for (let i = 0; i < 20; i += 1) s = tick(s);
    s = setViewing(s, true);
    expect(shouldFire(s)).toBe(false);
    expect(shouldFire(setViewing(s, false))).toBe(true);
  });
});
