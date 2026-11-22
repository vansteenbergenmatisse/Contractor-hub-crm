// Fills the {tokens} of a sample text with the signed-in business's own facts. A missing fact is never
// invented: the business name and the person fall back to "our team" (capitalised at the start of a
// sentence), any other missing value is left out and the gap is closed so no stray space or comma stays.
// Tokens this helper does not know stay as they are (the customer ones, HighLevel fills them).

const NEUTRAL = "our team";

const lit = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const atSentenceStart = (whole: string, offset: number) => /(^|[.!?]\s+)$/.test(whole.slice(0, offset));

const neutral = (whole: string, offset: number) => (atSentenceStart(whole, offset) ? "Our team" : NEUTRAL);

export type FactTokens = {
  // Token names without braces, e.g. "name" and "first".
  businessToken: string;
  personToken: string;
  business: string;
  person: string;
  // Other tokens: name to value. An empty value leaves the token out.
  values?: Record<string, string>;
};

export function fillFacts(text: string, f: FactTokens): string {
  // "{person} from {business}" keeps its words only when both are known; otherwise it is one name.
  let out = text.replace(new RegExp(`\\{${lit(f.personToken)}\\} from \\{${lit(f.businessToken)}\\}`, "g"), (m, offset: number, whole: string) =>
    f.business && f.person ? m : f.business || f.person || neutral(whole, offset),
  );
  const single = (token: string, value: string) => {
    out = out.replace(new RegExp(`\\{${lit(token)}\\}`, "g"), (_m, offset: number, whole: string) => value || neutral(whole, offset));
  };
  single(f.businessToken, f.business);
  single(f.personToken, f.person);
  let left = false;
  for (const [token, value] of Object.entries(f.values ?? {})) {
    if (!out.includes(`{${token}}`)) continue;
    if (!value) left = true;
    out = out.replaceAll(`{${token}}`, value);
  }
  return left ? out.replace(/ +([,.!?;:])/g, "$1").replace(/ {2,}/g, " ").trim() : out;
}
