"use client";

import type { ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { SettingsPage } from "@/features/settings";
import type { ImageUploader, SaveAnswer, SaveOptions, ValueChange } from "@/features/settings";
import { sendImage } from "../api/send-image";
import { sendValues } from "../api/send-values";

type Props = Omit<ComponentProps<typeof SettingsPage>, "saveValues" | "readOnly" | "uploadImage"> & {
  // The server flags allow Change image for this tenant.
  mediaReplace?: boolean;
};

// The Settings page for an owner whose sub-account the server flags allow to be written.
// After a write that may have landed the layout is rendered again, because the frame's details come
// from it and a client navigation does not re-render a layout.
export function SettingsWriteBackPage({ mediaReplace = false, ...props }: Props) {
  const router = useRouter();
  async function save(changes: ValueChange[], options?: SaveOptions): Promise<SaveAnswer> {
    const answer = await (options ? sendValues(changes, options) : sendValues(changes));
    if (answer.kind === "results" && answer.results.some(({ status }) => status === "saved" || status === "unknown")) router.refresh();
    return answer;
  }
  const upload: ImageUploader = async (input) => {
    const answer = await sendImage(input);
    if (answer.status === "saved" || answer.status === "unknown") router.refresh();
    return answer;
  };
  return <SettingsPage {...props} saveValues={save} uploadImage={mediaReplace ? upload : undefined} />;
}
