import type { ReactNode } from "react";
import { BACKGROUND_KEY, IMAGE_KEYS, LINK_GROUP_KEYS, SVG_IMAGE_KEYS } from "../api/field-groups";
import { COLOR_KEYS, labelOfKey } from "../api/fields";
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
};

const OUR_WORK: ReadonlySet<string> = new Set(OUR_WORK_KEYS);
const COLORS: ReadonlySet<string> = new Set(COLOR_KEYS);

function helpersOf(key: string, value: string): string[] {
  const out: string[] = [];
  if (SVG_IMAGE_KEYS.has(key)) out.push("SVG");
  if ((LINK_GROUP_KEYS.has(key) || OUR_WORK.has(key)) && value.trim() === "") out.push("Not filled in yet");
  return out;
}

// One value on a step: the field, its image preview and its Change image control.
export function StepField({ fieldKey: key, value, saved, error, readOnly, imageHosts = DEFAULT_IMAGE_HOSTS, onChange, imageControl }: Props) {
  const field = { key, label: labelOfKey(key) };
  const hasImage = IMAGE_KEYS.has(key) || OUR_WORK.has(key);
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
