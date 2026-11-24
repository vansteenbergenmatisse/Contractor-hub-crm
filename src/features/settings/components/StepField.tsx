import type { ReactNode } from "react";
import { BACKGROUND_KEY, LINK_GROUP_KEYS, SVG_IMAGE_KEYS } from "../api/field-groups";
import { COLOR_KEYS, isPageTextKey, labelOfKey } from "../api/fields";
import { isImageKey } from "../api/image-keys";
import { OUR_WORK_KEYS } from "../api/folder-keys";
import { DEFAULT_IMAGE_HOSTS, previewSrc } from "../api/image-preview";
import type { Field, Problem } from "../types";
import { ImagePreview } from "./ImagePreview";
import { ValueField } from "./ValueField";

type Props = {
  fieldKey: string;
  value: string;
  saved: string;
  error: Problem | null;
  readOnly: boolean;
  imageHosts?: readonly string[];
  onChange: (key: string, value: string) => void;
  imageControl?: (field: Field, saved: string, dirty: boolean) => ReactNode;
  // The value is too long to send to the page: listed by name, read-only.
  long?: boolean;
  // Forge Forward locked this key: shown read-only, the server refuses it on save.
  locked?: boolean;
};

export const TOO_LONG_NOTE = "Too long to edit here. Change it in HighLevel";
export const LOCKED_NOTE = "Locked by Forge Forward. Ask us to change it.";
export const PAGE_TEXT_NOTE = "Website page text. Change it in HighLevel";

const OUR_WORK: ReadonlySet<string> = new Set(OUR_WORK_KEYS);
const COLORS: ReadonlySet<string> = new Set(COLOR_KEYS);

function helpersOf(key: string, value: string): string[] {
  const out: string[] = [];
  if (SVG_IMAGE_KEYS.has(key)) out.push("SVG");
  if ((LINK_GROUP_KEYS.has(key) || OUR_WORK.has(key)) && value.trim() === "") out.push("Not filled in yet");
  return out;
}

// One value on a step: the field, its image preview and its Change image control.
export function StepField({ fieldKey: key, value, saved, error, readOnly, imageHosts = DEFAULT_IMAGE_HOSTS, onChange, imageControl, long = false, locked = false }: Props) {
  const field = { key, label: labelOfKey(key) };
  if (locked && !long) {
    return <ValueField field={field} value={saved} saved={saved} invalid={false} readOnly helpers={[LOCKED_NOTE]} onChange={onChange} />;
  }
  // A page's text or address outside a protected folder: shown as plain text, never edited here.
  if (long || isPageTextKey(key)) {
    return <ValueField field={field} value={long ? "" : value} saved={long ? "" : saved} invalid={false} readOnly helpers={[long ? TOO_LONG_NOTE : PAGE_TEXT_NOTE]} onChange={onChange} />;
  }
  const hasImage = isImageKey(key);
  return (
    <ValueField
      field={field}
      value={value}
      saved={saved}
      invalid={error?.key === key}
      error={error?.key === key ? error.message : undefined}
      readOnly={readOnly}
      swatch={COLORS.has(key)}
      helpers={helpersOf(key, value)}
      wide={key === "business_hours"}
      onChange={onChange}
    >
      {hasImage ? <ImagePreview src={previewSrc(value, imageHosts, key === BACKGROUND_KEY)} label={field.label} /> : null}
      {imageControl?.(field, saved, value.trim() !== saved.trim())}
    </ValueField>
  );
}
