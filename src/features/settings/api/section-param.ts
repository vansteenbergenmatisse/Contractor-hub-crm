import type { SectionKey } from "../types";

// `/settings?section=<name>` opens that section (Payments links to `?section=connections`).
const BY_NAME: Readonly<Record<string, SectionKey>> = {
  business: "biz",
  colors: "colors",
  connections: "conn",
  choices: "choice",
  soon: "soon",
};

export function sectionFromParam(param: string | string[] | undefined): SectionKey | null {
  const name = Array.isArray(param) ? param[0] : param;
  return typeof name === "string" && Object.hasOwn(BY_NAME, name) ? BY_NAME[name] : null;
}
