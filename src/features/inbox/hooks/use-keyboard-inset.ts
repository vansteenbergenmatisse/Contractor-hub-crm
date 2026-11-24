"use client";

import { useEffect, type RefObject } from "react";
import { keyboardInset } from "../api/keyboard";

// Keeps the reply box above the on-screen keyboard: publishes the covered height as `--fd-kb` and
// `data-kb` on the element, for the CSS. Set directly so typing never re-renders the conversation.
export function useKeyboardInset(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    const element = ref.current;
    if (!viewport || !element) return;
    const update = () => {
      const inset = keyboardInset({ layoutHeight: window.innerHeight, height: viewport.height, offsetTop: viewport.offsetTop, scale: viewport.scale });
      if (inset > 0) {
        element.style.setProperty("--fd-kb", `${inset}px`);
        element.dataset.kb = "1";
      } else {
        element.style.removeProperty("--fd-kb");
        delete element.dataset.kb;
      }
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [ref]);
}
