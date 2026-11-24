// Owners only. An admin in View as client has the admin role and never passes.
export type LeadsViewer = { role: string; hasTenant: boolean; viewing?: boolean };

export function canExportLeads(viewer: LeadsViewer | null | undefined): boolean {
  return !!viewer && !viewer.viewing && viewer.role === "owner" && viewer.hasTenant;
}
