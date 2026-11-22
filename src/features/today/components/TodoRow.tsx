"use client";

import { useRowGestures } from "@/features/app-shell";
import { doneText, rowActions } from "../api/selectors";
import type { Todo, TodayState } from "../types";
import { Chip } from "./Chip";
import { Glyph } from "./Glyph";

// One to-do. One button does the job; the row then says what the system does next, with Undo.
// A swipe or its menu (long press, right-click, the menu key) presses the row's own buttons.
export function TodoRow({ todo, state, className, onPrimary, onSecondary, onUndo }: {
  todo: Todo;
  state: TodayState;
  className: string;
  onPrimary: () => void;
  onSecondary: () => void;
  onUndo: () => void;
}) {
  const actions = rowActions(todo, state.status[todo.id] ?? 0, { primary: onPrimary, secondary: onSecondary, undo: onUndo });
  const gestures = useRowGestures<HTMLLIElement>({ label: todo.name, actions });
  return (
    <li className={className} tabIndex={0} {...gestures}>
      <div className="fd-rx">
        <p className="fd-rt"><span className="fd-strike">{todo.titleBefore} <b>{todo.name}</b></span></p>
        <div className="fd-rsw">
          <p className="fd-rs">
            {todo.amount ? <span className="fd-sm"><b>{todo.amount}</b> · </span> : null}
            {todo.detail}
            {todo.waiting ? <> <Chip tone="warn" icon="clock">{todo.waiting}</Chip></> : null}
          </p>
          <p className="fd-rd"><Glyph name="check" size={15} strokeWidth={2.6} /><span>{doneText(state, todo)}</span></p>
        </div>
      </div>
      <span className="fd-amt">{todo.amount}</span>
      <div className="fd-ra">
        {todo.secondary ? <button type="button" className="fd-btn is-plain fd-act2" onClick={onSecondary}>{todo.secondary}</button> : null}
        <button type="button" className="fd-btn fd-act" onClick={onPrimary}>
          {todo.primary.short ? <><span className="fd-lg">{todo.primary.label}</span><span className="fd-sm">{todo.primary.short}</span></> : todo.primary.label}
        </button>
        <button type="button" className="fd-link fd-undo" onClick={onUndo}>Undo</button>
      </div>
    </li>
  );
}
