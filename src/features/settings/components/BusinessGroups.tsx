import type { ComponentProps } from "react";
import { BACKGROUND_KEY, IMAGE_KEYS, LINK_GROUP_KEYS, SVG_IMAGE_KEYS, type ShownField, type ShownGroup } from "../api/field-groups";
import { DEFAULT_IMAGE_HOSTS, previewSrc } from "../api/image-preview";
import { ImagePreview } from "./ImagePreview";
import { ValueField } from "./ValueField";

type Props = {
  groups: readonly ShownGroup[];
  imageHosts?: readonly string[];
  fieldProps: (field: ShownField) => ComponentProps<typeof ValueField>;
  // The id of the folder name on screen, read out with each link in the folder.
  folderNameId?: string;
};

function helpersOf(field: ShownField, value: string): string[] {
  const out: string[] = [];
  if (SVG_IMAGE_KEYS.has(field.key)) out.push("SVG");
  if (LINK_GROUP_KEYS.has(field.key) && value.trim() === "") out.push("Not filled in yet");
  return out;
}

// The Business essentials fields, one named fieldset per group.
export function BusinessGroups({ groups, imageHosts = DEFAULT_IMAGE_HOSTS, fieldProps, folderNameId }: Props) {
  return groups.map((group) => (
    <fieldset className="fd-cvset" key={group.title}>
      <legend className="fd-cgh">{group.title}</legend>
      <div className="fd-cvg">
        {group.fields.map((field) => {
          const props = fieldProps(field);
          return (
            <ValueField key={field.key} {...props} helpers={helpersOf(field, props.value)} describedBy={LINK_GROUP_KEYS.has(field.key) ? folderNameId : undefined} wide={field.key === "business_hours"}>
              {IMAGE_KEYS.has(field.key) ? <ImagePreview src={previewSrc(props.value, imageHosts, field.key === BACKGROUND_KEY)} label={field.label} /> : null}
            </ValueField>
          );
        })}
      </div>
    </fieldset>
  ));
}
