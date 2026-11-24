// Public API of the template-copy feature. Other code imports from "@/features/template-copy" only.
// Admin "Copy values from template": a new client starts as a copy of the template sub-account's custom
// values, matched by key. Off unless TEMPLATE_COPY_ENABLED is "true" and TEMPLATE_TENANT_ID is set.
export { templateCopyRoute, loadTemplateCopyView } from "./api/instance";
export { handleTemplateCopy } from "./api/route";
export type { TemplateCopyRouteDeps } from "./api/route";
export { applyTemplateCopy, previewTemplateCopy, BATCH_BUDGET_MS, MAX_IMAGES_PER_BATCH, MAX_WRITES_PER_BATCH } from "./api/apply";
export type { ApplyInput, CopyDeps } from "./api/apply";
export { createImageCopier, folderPath } from "./api/image-copy";
export type { ImageCopyDeps } from "./api/image-copy";
export { compressToWebp, MAX_IMAGE_BYTES, MAX_SIDE } from "./api/compress";
export { createPacer, BACKOFF_MS, PACE_MS } from "./api/pace";
export { isAllowedMediaUrl, isImageLink, planCopy, templateCopyConfig, toPreview, valueToken } from "./api/plan";
export { identityKeys, templateWarnings, MAX_WARNING_READS, WARNING_BUDGET_MS } from "./api/warning";
export type {
  CopyBatch,
  CopyKeyResult,
  CopyKeyStatus,
  CopyPreview,
  ImageCopyOutcome,
  KeyState,
  PlanEntry,
  PreviewAnswer,
  PreviewDifferent,
  PreviewFill,
  TemplateCopyConfig,
  TemplateCopyView,
} from "./types";
