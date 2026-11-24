import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { hexToHsv, hsvAt, hsvToHex, nudgeHsv, typedHex, type Hsv } from "../api/color";

type Props = {
  anchor: RefObject<HTMLButtonElement | null>;
  host: Element;
  label: string;
  // The color to start from, or null when the field holds none.
  startHex: string | null;
  onPick: (hex: string) => void;
  onClose: () => void;
};

const GUTTER = 8;
const FOCUSABLE = "[tabindex='0'],input,button";

// A saturation and brightness square, a hue slider and a hex field in a popover. Every change goes
// to the field through `onPick`; nothing is called until the color really changes.
export function ColorPad({ anchor, host, label, startHex, onPick, onClose }: Props) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(startHex ?? "#000000"));
  const [text, setText] = useState(startHex?.toUpperCase() ?? "");
  const [spot, setSpot] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const square = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const hexId = useId();
  const errorId = useId();
  const bad = text !== "" && typedHex(text) === null;

  // Under the swatch, or above it when there is no room, and always inside the screen.
  useLayoutEffect(() => {
    function place() {
      const box = root.current;
      const from = anchor.current?.getBoundingClientRect();
      const pad = box?.getBoundingClientRect();
      if (!box || !from || !pad) return;
      // The visible area: above an open keyboard and inside the notch and home bar insets.
      const styles = getComputedStyle(box);
      const inset = (side: string) => parseFloat(styles.getPropertyValue(`--pad-safe-${side}`)) || 0;
      const view = window.visualViewport;
      const hasView = !!view && view.height > 0;
      const viewTop = (hasView ? view.offsetTop : 0) + GUTTER + inset("t");
      const viewBottom = (hasView ? view.offsetTop + view.height : window.innerHeight) - GUTTER - inset("b");
      const maxHeight = Math.max(0, viewBottom - viewTop);
      const height = Math.min(Math.max(pad.height, box.scrollHeight), maxHeight);
      const below = from.bottom + GUTTER;
      const top = below + height <= viewBottom ? below : from.top - height - GUTTER;
      setSpot({
        top: Math.max(viewTop, Math.min(top, viewBottom - height)),
        left: Math.max(GUTTER + inset("l"), Math.min(from.left, window.innerWidth - pad.width - GUTTER - inset("r"))),
        maxHeight,
      });
    }
    place();
    const view = window.visualViewport;
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    view?.addEventListener("resize", place);
    view?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      view?.removeEventListener("resize", place);
      view?.removeEventListener("scroll", place);
    };
  }, [anchor]);

  // Only once placed: a browser cannot focus inside the pad while it is still hidden.
  const placed = spot !== null;
  useEffect(() => {
    if (placed) square.current?.focus({ preventScroll: true });
  }, [placed]);

  // The swatch's own click closes the pad, so a press on it is not an outside press.
  useEffect(() => {
    function outside(event: globalThis.PointerEvent) {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !anchor.current?.contains(target)) onClose();
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [anchor, onClose]);

  function apply(next: Hsv) {
    setHsv(next);
    const hex = hsvToHex(next);
    if (hex === typedHex(text)) return;
    setText(hex);
    onPick(hex);
  }

  function fromPointer(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    apply(hsvAt(hsv.h, (event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height));
  }

  function typed(value: string) {
    setText(value);
    const hex = typedHex(value);
    if (!hex) return;
    setHsv(hexToHsv(hex));
    onPick(hex);
  }

  function onSquareKey(event: KeyboardEvent<HTMLDivElement>) {
    const next = nudgeHsv(hsv, event.key, event.shiftKey);
    if (next === hsv) return;
    event.preventDefault();
    apply(next);
  }

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const items = [...(root.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return createPortal(
    <div
      ref={root}
      className="fd-pad"
      role="dialog"
      aria-label={label}
      style={spot ? { top: spot.top, left: spot.left, maxHeight: spot.maxHeight } :{ top: 0, left: 0, visibility: "hidden" }}
      onKeyDown={onKey}
    >
      <div
        ref={square}
        className="fd-pads"
        role="slider"
        tabIndex={0}
        aria-label="Saturation and brightness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s)}
        aria-valuetext={`Saturation ${Math.round(hsv.s)} percent, brightness ${Math.round(hsv.v)} percent`}
        style={{ backgroundColor: `hsl(${Math.round(hsv.h)} 100% 50%)` }}
        onKeyDown={onSquareKey}
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          fromPointer(event);
        }}
        onPointerMove={(event) => {
          if (dragging.current) fromPointer(event);
        }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
      >
        <span className="fd-padt" style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%`, background: hsvToHex(hsv) }} />
      </div>
      <input
        className="fd-padh"
        type="range"
        min={0}
        max={360}
        step={1}
        aria-label="Hue"
        value={Math.round(hsv.h)}
        onChange={(event) => apply({ ...hsv, h: Number(event.target.value) })}
      />
      <div className="fd-padr">
        <div>
          <label className="fd-ll" htmlFor={hexId}>Hex color</label>
          <input
            className={`fd-lin${bad ? " is-bad" : ""}`}
            id={hexId}
            type="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={7}
            value={text}
            aria-invalid={bad ? true : undefined}
            aria-describedby={bad ? errorId : undefined}
            onChange={(event) => typed(event.target.value)}
          />
        </div>
        <button type="button" className="fd-btn is-plain" onClick={onClose}>Done</button>
      </div>
      {bad ? <p className="fd-pade" id={errorId}>Use 6 digits, like #2E7D32.</p> : null}
    </div>,
    host,
  );
}
