"use client";

import { useEffect, useState } from "react";

// The step card in view, for the rail. The app scrolls inside `.fd-main`, so that is the observer's
// root. Without IntersectionObserver the rail simply keeps the first step.
export function useCurrentStep(ids: readonly string[], enabled: boolean): string {
  const [current, setCurrent] = useState(ids[0] ?? "");
  const joined = ids.join(",");
  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;
    const seen = new Map<string, number>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.step;
        if (!id) continue;
        if (entry.isIntersecting) seen.set(id, entry.intersectionRatio);
        else seen.delete(id);
      }
      const first = joined.split(",").find((id) => seen.has(id));
      if (first) setCurrent(first);
    }, { root: document.querySelector(".fd-main"), rootMargin: "-15% 0px -60% 0px", threshold: [0, 0.25, 0.5] });
    for (const id of joined.split(",")) {
      const element = document.getElementById(`s-card-${id}`);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [joined, enabled]);
  return current;
}
