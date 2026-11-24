"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { afterPause } from "@/shared/lib/after-pause";
import type { AddressSuggestion } from "@/shared/lib/places-search";
import { searchAddresses } from "../api/save-lead";

const WAIT_MS = 250;
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

type Props = { id: string; value: string; search: boolean; onChange: (value: string) => void };

// The address field. With search on it is a combobox over the server's address proxy. With search
// off, or once a search fails, it is a plain text field and what was typed stays.
export function AddressField({ id, value, search, onChange }: Props) {
  const [broken, setBroken] = useState(false);
  const [options, setOptions] = useState<AddressSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const token = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const cancelWait = useRef<(() => void) | null>(null);
  const live = search && !broken;
  const open = live && options.length > 0;
  const listId = `${id}-list`;

  const stop = () => {
    cancelWait.current?.();
    cancelWait.current = null;
    const running = request.current;
    request.current = null;
    running?.abort();
  };
  useEffect(() => stop, []);
  // In a short sheet the list opens below the fold, so it is brought into view.
  const list = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    if (open) list.current?.scrollIntoView?.({ block: "nearest" });
  }, [open]);

  const close = () => {
    setOptions([]);
    setActive(-1);
  };

  const type = (text: string) => {
    onChange(text);
    stop();
    setActive(-1);
    const input = text.trim();
    if (!live || input.length < 3) {
      setOptions([]);
      return;
    }
    cancelWait.current = afterPause(async () => {
      const controller = new AbortController();
      request.current = controller;
      token.current ??= newToken();
      const found = await searchAddresses(input, token.current, controller.signal);
      if (request.current !== controller) return; // a newer search took over
      request.current = null;
      if (found === null) {
        setBroken(true);
        setOptions([]);
        return;
      }
      setOptions(found);
    }, WAIT_MS);
  };

  const pick = (option: AddressSuggestion) => {
    stop();
    onChange(option.text);
    close();
    token.current = null; // a chosen address ends the search session
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((now) => (now + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((now) => (now <= 0 ? options.length - 1 : now - 1));
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      pick(options[active]);
    } else if (event.key === "Escape") {
      // Closes the list only. The dialog around it stays open.
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  const combo = live
    ? {
        role: "combobox" as const,
        "aria-autocomplete": "list" as const,
        "aria-expanded": open,
        "aria-controls": listId,
        "aria-activedescendant": open && active >= 0 ? `${listId}-${active}` : undefined,
        "data-address-open": open ? "" : undefined,
      }
    : {};

  return (
    <>
      <input className="fd-lin" id={id} type="text" autoCapitalize="words" autoComplete="off" value={value} onChange={(e) => type(e.target.value)} onKeyDown={onKeyDown} onBlur={() => { stop(); close(); }} {...combo} />
      {live ? (
        <ul ref={list} className="fd-adl" id={listId} role="listbox" aria-label="Address suggestions" hidden={!open}>
          {options.map((option, i) => (
            <li key={option.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={i === active ? "is-on" : undefined} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(option)}>
              {option.text}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
