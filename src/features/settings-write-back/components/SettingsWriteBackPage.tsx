"use client";

import type { ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { SettingsPage } from "@/features/settings";
import type { SaveAnswer, ValueChange } from "@/features/settings";
import { sendValues } from "../api/send-values";

// The Settings page for an owner whose sub-account the server flags allow to be written.
// After a write that may have landed the layout is rendered again, because the frame's details come
// from it and a client navigation does not re-render a layout.
export function SettingsWriteBackPage(props: Omit<ComponentProps<typeof SettingsPage>, "saveValues" | "readOnly">) {
  const router = useRouter();
  async function save(changes: ValueChange[]): Promise<SaveAnswer> {
    const answer = await sendValues(changes);
    if (answer.kind === "results" && answer.results.some(({ status }) => status === "saved" || status === "unknown")) router.refresh();
    return answer;
  }
  return <SettingsPage {...props} saveValues={save} />;
}
