import type { ImageStatus } from "../types";

export const IMAGE_SAVED = "Image changed. Your old file is still in your media library.";

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
};

export const imageMessage = (status: Exclude<ImageStatus, "saved">) => MESSAGES[status];
