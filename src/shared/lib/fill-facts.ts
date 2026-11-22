// Fills the {tokens} of a sample text with the signed-in business's own facts. A missing fact is never
// invented: a missing business name or person drops with its clause ("this is {name}", "to {name}"), a
// missing subject becomes "we" with the verb to match, and any other missing value is left out with its gap.
// Tokens this helper does not know stay as they are (the customer ones, HighLevel fills them).

const WE = "\uE000";

const lit = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const atSentenceStart = (whole: string, offset: number) => /(^|[.!?]\s+)$/.test(whole.slice(0, offset));

// "calls" -> "call", "is" -> "are": the verb after a subject that became "we".
const IRREGULAR: Record<string, string> = { is: "are", has: "have", was: "were", does: "do", goes: "go" };
const weVerb = (verb: string) => IRREGULAR[verb] ?? (verb.length > 3 && verb.endsWith("s") && !verb.endsWith("ss") ? verb.slice(0, -1) : verb);

export type FactTokens = {
  // Token names without braces, e.g. "name" and "first".
  businessToken: string;
  personToken: string;
  business: string;
  person: string;
  // Other tokens: name to value. An empty value leaves the token out.
  values?: Record<string, string>;
};

function leaveOutMissing(text: string, f: FactTokens): string {
  if (f.business && f.person) return text;
  // "{person} from {business}" keeps its words only when both are known; otherwise it is one name.
  let out = text.replace(new RegExp(`\\{${lit(f.personToken)}\\} from \\{${lit(f.businessToken)}\\}`, "g"), () => f.business || f.person || WE);
  for (const [token, value] of [[f.businessToken, f.business], [f.personToken, f.person]]) {
    if (value) continue;
    const t = `\\{${lit(token)}\\}`;
    out = out.replace(new RegExp(` (?:to|from|at|with) ${t}`, "g"), "").replace(new RegExp(t, "g"), WE);
  }
  return out
    .replace(new RegExp(`,? this is ${WE}`, "g"), "")
    .replace(new RegExp(`(^|[.!?]\\s+)This is ${WE}[.!?]\\s*`, "g"), "$1")
    .replace(new RegExp(`,? ${WE} here\\b`, "g"), "")
    .replace(new RegExp(`\\bleave ${WE} `, "g"), "leave ")
    .replace(new RegExp(`${WE}( +)([a-z]+)\\b`, "g"), (_m, gap: string, verb: string) => `${WE}${gap}${weVerb(verb)}`)
    .replace(new RegExp(WE, "g"), (_m, offset: number, whole: string) => (atSentenceStart(whole, offset) ? "We" : "we"));
}

export function fillFacts(text: string, f: FactTokens): string {
  let out = leaveOutMissing(text, f);
  const single = (token: string, value: string) => {
    out = out.replaceAll(`{${token}}`, () => value);
  };
  single(f.businessToken, f.business);
  single(f.personToken, f.person);
  let left = false;
  for (const [token, value] of Object.entries(f.values ?? {})) {
    if (!out.includes(`{${token}}`)) continue;
    if (!value) left = true;
    // A function replacer: a `$&` or `$'` inside a value (legal in a URL) must stay literal text.
    out = out.replaceAll(`{${token}}`, () => value);
  }
  return left ? out.replace(/ +([,.!?;:])/g, "$1").replace(/ {2,}/g, " ").trim() : out;
}
