// The colour behind a swiped row that says what letting go does (design `uxSwipe` strip):
// main colour for a swipe right, sub colour for left, a pale tint when that side has no action,
// and the word grows a little (`is-go`) once letting go runs it. Fixed to the row's place on screen.
export type SwipeView = {
  side: "r" | "l";
  go: boolean;
  none: boolean;
  label: string;
  top: number;
  height: number;
  left: number;
  width: number;
};

export function SwipeStrip({ view }: { view: SwipeView }) {
  const cls = `fx-swipe is-on is-${view.side}${view.go ? " is-go" : ""}${view.none ? " is-none" : ""}`;
  return (
    <div id="fx-swipe" className={cls} aria-hidden="true" style={{ top: view.top, height: view.height, left: view.left, width: view.width }}>
      <span className="fx-swl">{view.label}</span>
    </div>
  );
}
