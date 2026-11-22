"use client";

import { useLayoutEffect, useState } from "react";
import { giveFxLayer, takeFxLayer } from "../api/fx-layer";

// useFxLayer(active = true): HTMLElement | null
// The shared `#fx` layer while `active` (null on the server and in the first client render). Draw into it
// with createPortal; see api/fx-layer.ts.
export function useFxLayer(active = true): HTMLElement | null {
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!active) return;
    const taken = takeFxLayer();
    // The layer is a DOM node outside React, taken here; its element has to reach the render (portal).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLayer(taken);
    return () => {
      giveFxLayer(taken);
      setLayer(null);
    };
  }, [active]);
  return active ? layer : null;
}
