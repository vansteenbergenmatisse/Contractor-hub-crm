"use client";

import type { ComponentProps } from "react";
import { SettingsPage } from "@/features/settings";
import { sendValues } from "../api/send-values";

// The Settings page for an owner whose sub-account the server flags allow to be written.
export function SettingsWriteBackPage(props: Omit<ComponentProps<typeof SettingsPage>, "saveValues" | "readOnly">) {
  return <SettingsPage {...props} saveValues={sendValues} />;
}
