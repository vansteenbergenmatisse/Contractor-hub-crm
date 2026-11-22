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

// How long the count stays on 0 before the send runs (the design's 300 ms beat).
export const FIRE_DELAY_MS = 300;

export type SendController = {
  state: () => TimerState;
  // One second passes.
  tick: () => void;
  // View (true) pauses and shows the document; Back (false) goes on.
  view: (on: boolean) => void;
  // Cancel: closes and sends nothing, ever.
  cancel: () => void;
  // Runs onDone once, only when the count is at 0 and nothing is paused or cancelled.
  fire: () => void;
};

// The dialog's decisions, without React or timers, so each one is tested. `schedule` waits `ms`
// and returns a function that stops the wait. Every way out calls onClose once; onDone runs at most
// once and never after Cancel.
export function createSendController({ onDone, onClose, schedule, onChange }: {
  onDone: () => void;
  onClose: () => void;
  schedule: (fn: () => void, ms: number) => () => void;
  onChange?: (state: TimerState) => void;
}): SendController {
  let state = startTimer();
  let done: (() => void) | undefined = onDone;
  let closed = false;
  const set = (next: TimerState) => {
    if (next === state) return;
    state = next;
    onChange?.(state);
  };
  const fire = () => {
    if (closed || !shouldFire(state)) return;
    const run = done;
    done = undefined;
    closed = true;
    set(markFired(state));
    onClose();
    run?.();
  };
  const arm = () => {
    if (shouldFire(state)) schedule(fire, FIRE_DELAY_MS);
  };
  return {
    state: () => state,
    tick: () => {
      if (closed) return;
      const next = tick(state);
      if (next === state) return;
      set(next);
      arm();
    },
    view: (on) => {
      if (closed) return;
      set(setViewing(state, on));
      if (!on) arm();
    },
    cancel: () => {
      if (closed) return;
      closed = true;
      done = undefined;
      onClose();
    },
    fire,
  };
}

// What each button of the dialog calls. The component uses exactly these.
export function sendDialogHandlers(controller: SendController) {
  return {
    onCancel: () => controller.cancel(),
    onView: () => controller.view(true),
    onBack: () => controller.view(false),
  };
}
export type SendDialogHandlers = ReturnType<typeof sendDialogHandlers>;
