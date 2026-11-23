import type { ImageAnswer, ImageUploader } from "@/features/settings";

// The browser's call to this app's image route. HighLevel is only ever called by the server.
export const sendImage: ImageUploader = async ({ key, expected, blob }) => {
  const body = new FormData();
  body.append("key", key);
  body.append("expected", expected);
  body.append("file", blob, blob.type === "image/svg+xml" ? "image.svg" : "image.webp");
  try {
    const response = await fetch("/api/settings/media", { method: "POST", body });
    if (response.status === 429) return { status: "limited" };
    if (response.status === 400 || response.status === 413) return { status: "invalid" };
    if (!response.ok) return { status: "failed" };
    const answer = (await response.json()) as ImageAnswer;
    return typeof answer?.status === "string" ? answer : { status: "failed" };
  } catch {
    return { status: "failed" };
  }
};
