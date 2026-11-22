"use client";

import { Fragment, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { isPhone, menuPosition, orderMenu, type RowAction } from "../api/gestures";
import type { MenuRequest } from "./GestureLayer";

// A row's menu (design `uxMenu`): a scrim, then `.fx-mbox` holding `.fx-menu[role=menu]` with one
// `.fx-mi[role=menuitem]` per action, destructive ones last in red after a `.fx-msep`. On a phone (or
// after a long press) the scrim dims and a copy of the pressed row sits above the menu (`.fx-pvw`).
// Arrow keys move (wrapping), Home and End jump, Escape or Tab closes. Rendered by GestureLayer.
export function RowMenu({ request, onClose }: { request: MenuRequest; onClose: (run?: RowAction) => void }) {
  const [phone] = useState(() => request.touch || isPhone());
  const box = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const items = orderMenu(request.actions);
  const firstBad = items.findIndex((a) => a.tone === "danger");

  useLayoutEffect(() => {
    const anchor = request.anchor;
    const r = anchor.getBoundingClientRect();
    const pv = preview.current;
    if (phone && pv) {
      // the pressed row, lifted above the menu: a copy inside empty copies of its parents, so it keeps its look
      let inner = anchor.cloneNode(true) as HTMLElement;
      [inner, ...Array.from(inner.querySelectorAll("[id]"))].forEach((x) => x.removeAttribute("id"));
      inner.style.transform = "";
      inner.style.transition = "";
      let p = anchor.parentElement;
      for (let n = 0; p && n < 4 && !p.classList.contains("fd-view") && !p.classList.contains("fd-main"); n++) {
        const shell = document.createElement(p.tagName);
        shell.className = `${String(p.className).replace(/\bfd-in\b/g, "")} fx-shell`;
        shell.appendChild(inner);
        inner = shell;
        p = p.parentElement;
      }
      pv.style.width = `${r.width}px`;
      pv.replaceChildren(inner);
    }
    const el = box.current;
    if (el) {
      const b = el.getBoundingClientRect();
      const at = phone
        ? { x: r.left, y: r.top }
        : request.keyboard
          ? { x: r.left + 16, y: r.top + Math.min(r.height, 44) }
          : { x: request.x, y: request.y };
      const pos = menuPosition(at, b, { width: window.innerWidth, height: window.innerHeight }, phone);
      el.style.left = `${pos.left}px`;
      el.style.top = `${pos.top}px`;
    }
    const first = menu.current?.querySelector<HTMLElement>(".fx-mi");
    if (request.keyboard && first) first.focus();
    else menu.current?.focus();
  }, [phone, request]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = Array.from(menu.current?.querySelectorAll<HTMLElement>(".fx-mi") ?? []);
    const i = list.indexOf(document.activeElement as HTMLElement);
    const n = list.length;
    let j = -1;
    if (event.key === "ArrowDown") j = i < 0 ? 0 : (i + 1) % n;
    else if (event.key === "ArrowUp") j = i < 0 ? n - 1 : (i + n - 1) % n;
    else if (event.key === "Home") j = 0;
    else if (event.key === "End") j = n - 1;
    else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (j >= 0 && list[j]) {
      event.preventDefault();
      list[j].focus();
    }
  };

  return (
    <>
      <div
        className={`fx-scrim fx-mscrim${phone ? " is-dim" : ""}`}
        onClick={() => onClose()}
        onContextMenu={(event) => { event.preventDefault(); onClose(); }}
      />
      <div ref={box} className={`fx-mbox${phone ? " is-ph" : ""}`} onKeyDown={onKeyDown}>
        {phone ? <div ref={preview} className="fx-pvw" aria-hidden="true" /> : null}
        <div ref={menu} className="fx-menu" role="menu" aria-label={request.label ? `Actions for ${request.label}` : "Actions"} tabIndex={-1}>
          {items.map((action, index) => (
            <Fragment key={`${index}-${action.label}`}>
              {index === firstBad && index > 0 ? <div className="fx-msep" role="separator" /> : null}
              <button type="button" className={`fx-mi${action.tone === "danger" ? " is-bad" : ""}`} role="menuitem" tabIndex={-1} onClick={() => onClose(action)}>
                {action.label}
              </button>
            </Fragment>
          ))}
        </div>
      </div>
    </>
  );
}
