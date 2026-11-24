// Types shared inside the template-copy feature (admin "Copy values from template").

// Off unless TEMPLATE_COPY_ENABLED is exactly "true" and TEMPLATE_TENANT_ID names a CRM tenant id.
export type TemplateCopyConfig = { enabled: boolean; templateTenantId: string | null };

// One template key against the target:
// fill: the target holds it blank; same: equal value; different: the target holds another value;
// missing: the target has no such key; duplicate: the target lists the key twice (never written);
// template_blank: the template holds nothing to copy.
export type KeyState = "fill" | "same" | "different" | "missing" | "duplicate" | "template_blank";

export type ValueRow = { key: string; value: string };

export type PlanEntry = { key: string; state: KeyState; template: string; target: string | null; image: boolean; secret: boolean };

// What the admin's browser gets. A value is present only for a key that is not secret-looking.
export type PreviewFill = { key: string; image: boolean; value?: string };
export type PreviewDifferent = { key: string; image: boolean; token: string; templateValue?: string; targetValue?: string };
export type CopyPreview = {
  counts: { templateKeys: number; fill: number; same: number; different: number; missing: number; duplicates: number; templateBlank: number; images: number; hidden: number };
  fill: PreviewFill[];
  same: string[];
  different: PreviewDifferent[];
  missing: string[];
  duplicates: string[];
  images: string[];
  // Keyed digest of every template value the preview read. Apply refuses when the template changed.
  templateDigest?: string;
  // The template's business_name, so the admin sees which sub-account values come from.
  templateName?: string;
};

export type CopyKeyStatus =
  | "filled"
  | "overwritten"
  | "unchanged"
  | "conflict"
  // A filled secret-looking key is never replaced: neither value can be shown or kept for an undo.
  | "secret_not_replaced"
  | "missing"
  | "rejected"
  | "permission"
  | "failed"
  | "unknown"
  | "needs_media_permission"
  | "image_failed"
  | "image_host_not_allowed"
  | "not_an_image";
export type CopyKeyResult = { key: string; status: CopyKeyStatus; image?: "reused" | "uploaded" };

// template_changed: the template's values are not the ones the preview showed; preview again.
export type CopyFailure = "busy" | "template_unreadable" | "target_unreadable" | "template_changed";
export type CopyBatch = { status: "ok"; results: CopyKeyResult[]; remaining: number; done: boolean } | { status: CopyFailure };
export type PreviewAnswer = { status: "ok"; preview: CopyPreview } | { status: Exclude<CopyFailure, "busy" | "template_changed"> };

export type ImageCopyOutcome =
  | { kind: "reused" | "uploaded"; url: string }
  | { kind: "needs_media_permission" | "image_failed" | "image_host_not_allowed" | "not_an_image" };

// For /admin/clients: the template's id (its row gets no copy button and no warning) and, per client
// id, the labels of identity values that still equal the template's. A client left out is unknown.
export type TemplateCopyView = { templateTenantId: string; warnings: Record<string, string[]> };
