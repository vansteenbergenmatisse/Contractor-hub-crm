// Joins the parts that have a value ("a · b"), so a missing part leaves no dangling separator.
export const joinParts = (parts: ReadonlyArray<string | null | undefined>, separator = " · "): string =>
  parts.map((p) => p?.trim() ?? "").filter(Boolean).join(separator);
