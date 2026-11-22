import type { CSSProperties } from "react";

// The pull-to-refresh spinner under the top bar (design `uxPull` indicator): eight spokes that fade in
// and turn with the pull (`--pull` 0 to 1), `is-ready` once letting go refreshes, `is-busy` while it runs.
export type PullView = { phase: "pull" | "ready" | "busy"; top: number; progress: number; text: string };

const SPOKES = [0, 45, 90, 135, 180, 225, 270, 315];

export function PullIndicator({ view }: { view: PullView }) {
  const cls = `fx-pull is-on${view.phase === "ready" ? " is-ready" : view.phase === "busy" ? " is-busy" : ""}`;
  const style = { top: view.top, "--pull": String(view.progress) } as CSSProperties;
  return (
    <div id="fx-pull" className={cls} role="status" style={style}>
      <svg className="fx-spin" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          {SPOKES.map((deg, i) => (
            <path key={deg} d="M12 3.5v4" transform={`rotate(${deg} 12 12)`} opacity={(1 - i * 0.1).toFixed(2)} />
          ))}
        </g>
      </svg>
      <span className="fx-pullt">{view.text}</span>
    </div>
  );
}
