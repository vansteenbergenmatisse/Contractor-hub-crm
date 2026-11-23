import type { ComponentProps } from "react";
import { LINK_GROUP_KEYS } from "../api/field-groups";
import { labelOfKey } from "../api/fields";
import { OUR_WORK_KEYS } from "../api/folder-keys";
import { DEFAULT_IMAGE_HOSTS, previewSrc } from "../api/image-preview";
import type { Field } from "../types";
import { ImagePreview } from "./ImagePreview";
import { ValueField } from "./ValueField";

type Props = {
  keys: readonly string[];
  imageHosts?: readonly string[];
  folderNameId?: string;
  fieldProps: (field: Field) => ComponentProps<typeof ValueField>;
};

const OUR_WORK: ReadonlySet<string> = new Set(OUR_WORK_KEYS);

// The fields of a folder without sub-groups. An "our work" value is an image link with a preview.
export function FolderFields({ keys, imageHosts = DEFAULT_IMAGE_HOSTS, folderNameId, fieldProps }: Props) {
  return (
    <div className="fd-cvg">
      {keys.map((key) => {
        const field = { key, label: labelOfKey(key) };
        const props = fieldProps(field);
        const link = LINK_GROUP_KEYS.has(key);
        return (
          <ValueField
            key={key}
            {...props}
            helpers={link && props.value.trim() === "" ? ["Not filled in yet"] : []}
            describedBy={link ? folderNameId : undefined}
          >
            {OUR_WORK.has(key) ? <ImagePreview src={previewSrc(props.value, imageHosts)} label={field.label} /> : null}
          </ValueField>
        );
      })}
    </div>
  );
}
