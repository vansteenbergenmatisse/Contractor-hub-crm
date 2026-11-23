import type { ImageAnswer, ImageFormat, ImageOldFile, ImageStatus, SvgProblemCode } from "../types";

export const IMAGE_SAVED = "Image changed. Your old file is still in your media library.";

const SAVED: Record<ImageOldFile, string> = {
  trashed: "Image replaced. The old file was moved to the trash in your media library.",
  in_use: "Image changed. The old file was kept because another setting still uses it.",
  kept: "Image changed, but the old file could not be removed. It is still in your media library.",
  unconfirmed: "Image changed. We could not confirm that the old file was removed, so check your media library.",
};

// What the owner reads when a change did not finish. Every one says where the old image stands.
const MESSAGES: Record<Exclude<ImageStatus, "saved">, string> = {
  needs_approval: "Image upload needs re-approval of the app for this account. Ask Forge Forward to approve it. Your current image is still live.",
  connection: "Your account connection needs attention. Your current image is still live.",
  conflict: "This image changed in your account. Check the link above and try again. Nothing was replaced.",
  missing: "This image does not exist in your account yet, so it was not changed.",
  duplicate: "This image is listed twice in your account, so it was not changed. Ask Forge Forward to fix it.",
  busy: "Another save is running. Try again in a moment. Your current image is still live.",
  bad_host: "The media library gave an unexpected address, so the image was not changed. Ask Forge Forward to check it.",
  hash_mismatch: "A file with this name did not match your image, so nothing was changed. Ask Forge Forward to check it.",
  rejected: "Your account refused this image. Your current image is still live.",
  unknown: "We could not confirm the change. Reload this page to see which image your account holds.",
  retry: "The image did not change. Your current image is still live. Try again.",
  limited: "Too many image changes. Try again later. Your current image is still live.",
  invalid: "This file cannot be used. Your current image is still live. Try another file.",
  failed: "The image could not be changed. Your current image is still live. Try again.",
  not_found: "We could not find this exact image in your media library, so nothing was changed. Your current image is still live.",
  ambiguous: "This image is in your media library more than once, so nothing was changed. Ask Forge Forward to check it.",
  library_limit: "We could not check your whole media library, so nothing was changed. Your current image is still live. Try again or ask Forge Forward.",
  format_mismatch: "The new file is a different format from your current file, so nothing was changed. Your current image is still live.",
};

const SVG_PROBLEMS: Record<SvgProblemCode, string> = {
  script: "This SVG contains a script.",
  outside_link: "This SVG links to an outside file.",
  embedded: "This SVG contains embedded web content.",
  animation: "This SVG contains animation.",
  doctype: "This SVG has a document type declaration. Export it again without one.",
  style: "This SVG has a style rule we cannot allow.",
  reference: "This SVG points to a part that is missing, repeated or points back to itself.",
  too_complex: "This SVG is too complex.",
  unsupported: "This SVG uses a feature we cannot allow.",
  broken: "This SVG file is damaged or cannot be read.",
};

const FORMAT_NAMES: Record<ImageFormat, string> = { webp: "WebP", png: "PNG", jpeg: "JPG", svg: "SVG" };

export const imageMessage = (status: Exclude<ImageStatus, "saved">) => MESSAGES[status];

export const imageSavedMessage = (answer: ImageAnswer) => (answer.oldFile ? SAVED[answer.oldFile] : IMAGE_SAVED);

// The status message plus what the server said about this particular file.
export function imageFailureMessage(answer: ImageAnswer): string {
  if (answer.status === "invalid" && answer.svgProblem) return `${SVG_PROBLEMS[answer.svgProblem]} Your current image is still live.`;
  if (answer.status === "format_mismatch" && answer.format) {
    const name = FORMAT_NAMES[answer.format];
    return `Your current file is a ${name}. Choose a ${name} file so its name stays correct. Nothing was changed.`;
  }
  const base = MESSAGES[answer.status === "saved" ? "unknown" : answer.status];
  return answer.leftover ? `${base} The new file could not be removed and is still in your media library.` : base;
}
