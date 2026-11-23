import type { ReactNode } from "react";
import type { Folder } from "../api/folders";
import { svgProps } from "./svg-props";

type Props = {
  folder: Folder;
  // How many of the shown values hold something.
  filled: number;
  total: number;
  open: boolean;
  dirty: boolean;
  onToggle: () => void;
  // Branding keeps its existing body id and grid class.
  bodyId?: string;
  bodyClass?: string;
  children: ReactNode;
};

export const folderNameId = (id: string) => `fd-fold-${id}-name`;

// One HighLevel folder: a heading button with its readable title, real name and count, and a body.
// The body stays in the page when closed, so a field keeps its value and can take focus after Save.
export function FolderSection({ folder, filled, total, open, dirty, onToggle, bodyId = `fd-fold-${folder.id}`, bodyClass = "fd-foldb", children }: Props) {
  return (
    <div className={`fd-fold${folder.id === "branding" ? " is-brand" : ""}`}>
      <h3 className="fd-foldh">
        <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
          <span className="fd-foldm">
            <span className="fd-foldt">{folder.title}</span>
            {folder.name ? <span className="fd-foldn" id={folderNameId(folder.id)}>{folder.name}</span> : null}
          </span>
          <span className="fd-foldc">
            {dirty ? <b>Not applied yet</b> : null}
            {filled} of {total} filled
          </span>
          <svg className="fd-foldi" width="16" height="16" {...svgProps}><path d="m9 6 6 6-6 6" /></svg>
        </button>
      </h3>
      <div className={`${bodyClass}${open ? "" : " is-off"}`} id={bodyId}>{children}</div>
    </div>
  );
}
