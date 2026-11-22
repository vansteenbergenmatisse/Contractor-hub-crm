import { rowClass } from "../api/selectors";
import type { NeedsFilter, RowStatus, Todo, TodayState } from "../types";
import { TodoRow } from "./TodoRow";

const FILTERS: ReadonlyArray<readonly [NeedsFilter, string]> = [["all", "All"], ["lead", "Leads"], ["quote", "Quotes"], ["job", "Jobs"]];

export function NeedsCard({ todos, state, onFilter, onPress, onUndo }: {
  todos: readonly Todo[];
  state: TodayState;
  onFilter: (filter: NeedsFilter) => void;
  onPress: (todo: Todo, value: RowStatus) => void;
  onUndo: (todo: Todo) => void;
}) {
  return (
    <section className="fd-card fd-need fd-in" style={{ "--i": 5 } as React.CSSProperties} aria-labelledby="fd-need-h">
      <div className="fd-ch">
        <h2 className="fd-ct" id="fd-need-h">Needs you</h2>
        <div className="fd-fl fd-nfl" role="group" aria-label="Which to-dos show">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" className={`fd-flb${state.filter === key ? " is-on" : ""}`} aria-pressed={state.filter === key} onClick={() => onFilter(key)}>{label}</button>
          ))}
        </div>
      </div>
      <ul className="fd-rows">
        {todos.map((todo) => (
          <TodoRow
            key={todo.id}
            todo={todo}
            state={state}
            className={rowClass(state, todos, todo)}
            onPrimary={() => onPress(todo, 1)}
            onSecondary={() => onPress(todo, 2)}
            onUndo={() => onUndo(todo)}
          />
        ))}
      </ul>
    </section>
  );
}
