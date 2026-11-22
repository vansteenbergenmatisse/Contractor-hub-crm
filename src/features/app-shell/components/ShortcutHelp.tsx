"use client";

import { useEffect, useRef, useState } from "react";
import { createFocusReturn } from "../api/focus";
import { helpRows } from "../api/keys";
import { inFxLayer } from "../api/fx-portal";
import { useFxLayer } from "../hooks/use-fx-layer";

// The shortcut list (⌘? or Ctrl ?), as in the design: Done takes focus, Tab stays on Done, Escape,
// Done or the scrim close it and focus goes back to where it was. Drawn in the shared `#fx` layer.
export function ShortcutHelp({ mac, onClose }: { mac: boolean; onClose: () => void }) {
  const done = useRef<HTMLButtonElement>(null);
  const [back] = useState(createFocusReturn);

  const layer = useFxLayer();
  useEffect(() => {
    if (!layer) return;
    back.remember(document.activeElement);
    done.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      } else if (event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        done.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      back.restore();
    };
  }, [back, onClose, layer]);

  return inFxLayer(
    <>
      <div className="fx-scrim fx-hscrim is-dim" onClick={onClose} />
      <div className="fx-help" role="dialog" aria-modal="true" aria-labelledby="fx-help-t">
        <h2 className="fx-ht" id="fx-help-t">Keyboard shortcuts</h2>
        <dl className="fx-hl">
          {helpRows(mac).map(([keys, text]) => (
            <div key={text} className="fx-hr">
              <dt>{text}</dt>
              <dd><kbd className="fx-k">{keys}</kbd></dd>
            </div>
          ))}
        </dl>
        <button type="button" ref={done} className="fd-btn is-fill fx-hx" onClick={onClose}>Done</button>
      </div>
    </>,
    layer,
  );
}
