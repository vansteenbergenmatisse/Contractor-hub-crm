// A phone browser bar that collapses changes the viewport by less than this; a keyboard by more.
const MIN_KEYBOARD_PX = 80;

export type ViewportSize = { layoutHeight: number; height: number; offsetTop: number; scale: number };

// How many pixels at the bottom of the layout the on-screen keyboard covers. Pinch zoom also shrinks
// the visual viewport, so it counts as no keyboard.
export function keyboardInset({ layoutHeight, height, offsetTop, scale }: ViewportSize): number {
  if (scale > 1.01 || layoutHeight - height < MIN_KEYBOARD_PX) return 0;
  return Math.max(0, Math.round(layoutHeight - height - offsetTop));
}
