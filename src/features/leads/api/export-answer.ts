// What the owner reads when an export did not produce a file.
const ANSWER: Record<string, string> = {
  busy: "Too many exports. Try again later.",
  failed: "The export did not work. Try again.",
};

export function exportAnswer(code: string | null | undefined): string | null {
  return code && Object.hasOwn(ANSWER, code) ? ANSWER[code] : null;
}
