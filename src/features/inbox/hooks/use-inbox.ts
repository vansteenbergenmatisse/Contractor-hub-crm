"use client";

import { useEffect, useReducer } from "react";
import { useShell } from "@/features/app-shell";
import { initialState, inboxReducer, waitingCount } from "../api/state";
import type { Conversation } from "../types";

// Page state as a reducer (local only) and the red number in the menu kept in step with it.
export function useInbox(conversations: readonly Conversation[]) {
  const [state, dispatch] = useReducer(inboxReducer, conversations, initialState);
  const { setInboxCount } = useShell();
  const waiting = waitingCount(state);
  useEffect(() => {
    setInboxCount(waiting);
  }, [waiting, setInboxCount]);
  return { state, dispatch };
}
