// The 20-second send timer (build prompt rule 10), as a small state machine so it can be tested
// without a browser. Phase 2 only counts on screen and runs the caller's `onDone`; the real hold
// happens on the server in Phase 3 (no send leaves this app in Phase 2).
export const SEND_SECONDS = 20;

export type TimerState = { n: number; viewing: boolean; fired: boolean };

export const startTimer = (): TimerState => ({ n: SEND_SECONDS, viewing: false, fired: false });

// One second passes. Paused while the document is shown; stops at 0 and then fires once.
export function tick(state: TimerState): TimerState {
  if (state.viewing || state.fired || state.n <= 0) return state;
  return { ...state, n: state.n - 1 };
}

export const setViewing = (state: TimerState, viewing: boolean): TimerState => ({ ...state, viewing });

// True when the count is at 0, nothing is paused, and it has not fired yet.
export const shouldFire = (state: TimerState): boolean => state.n === 0 && !state.viewing && !state.fired;

export const markFired = (state: TimerState): TimerState => ({ ...state, fired: true });
