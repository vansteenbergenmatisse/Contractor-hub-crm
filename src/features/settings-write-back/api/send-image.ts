import type { ImageAnswer, ImageUploader, SvgProblemCode } from "@/features/settings";

// The same header name as the route. Kept here so this browser file imports no server code.
const SVG_PROBLEM_HEADER = "x-svg-problem";
const FILE_NAMES: Readonly<Record<string, string>> = { "image/svg+xml": "image.svg", "image/png": "image.png", "image/jpeg": "image.jpg", "image/webp": "image.webp" };

// The browser's call to this app's image route. HighLevel is only ever called by the server.
export const sendImage: ImageUploader = async ({ key, expected, blob, unlock }) => {
  const body = new FormData();
  body.append("key", key);
  body.append("expected", expected);
  if (unlock) body.append("unlock", unlock);
  body.append("file", blob, FILE_NAMES[blob.type] ?? "image.webp");
  try {
    const response = await fetch("/api/settings/media", { method: "POST", body });
    if (response.status === 429) return { status: "limited" };
    if (response.status === 400 || response.status === 413) {
      const problem = response.headers.get(SVG_PROBLEM_HEADER) as SvgProblemCode | null;
      return problem ? { status: "invalid", svgProblem: problem } : { status: "invalid" };
    }
    if (!response.ok) return { status: "failed" };
    const answer = (await response.json()) as ImageAnswer;
    return typeof answer?.status === "string" ? answer : { status: "failed" };
  } catch {
    return { status: "failed" };
  }
};
