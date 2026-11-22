import { GROUPS, STAGES, groupOf } from "../api/stages";
import { countClass, groupButtonClass, mapClass, stageButtonClass } from "../api/view";
import type { BoardState } from "../types";

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

// The strip of stages: four groups, each with its stages and counts. On the computer the group
// buttons are the tabs; on a phone the stages are the list you tap.
export function StageMap({
  state,
  counts,
  groups,
  onGroup,
  onStage,
}: {
  state: BoardState;
  counts: readonly number[];
  groups: readonly number[];
  onGroup: (first: number) => void;
  onStage: (stage: number) => void;
}) {
  return (
    <nav className="fd-smapw fd-in" style={{ "--i": 1 } as React.CSSProperties} aria-label="Stages">
      <div className={mapClass(state)}>
        {GROUPS.map((g, j) => (
          <div key={g.name} className="fd-sg" style={{ "--n": g.last - g.first + 1 } as React.CSSProperties}>
            <p className="fd-sgl">{g.name}</p>
            <button type="button" className={groupButtonClass(state, j)} aria-pressed={groupOf(state.stg) === j} onClick={() => onGroup(g.first)}>
              <span className="fd-sgn">{g.name}</span>
              <span className="fd-sgc">{groups[j]}</span>
              <span className="fd-sgs">{g.sub}</span>
            </button>
            <div className="fd-sgt">
              {STAGES.slice(g.first, g.last + 1).map((st) => (
                <button key={st.index} type="button" className={stageButtonClass(state, st.index)} aria-pressed={state.stg === st.index} onClick={() => onStage(st.index)}>
                  <span className={countClass(state, st.index)}>{counts[st.index]}</span>
                  <span className="fd-stn">{st.name}</span>
                  <Chevron />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
