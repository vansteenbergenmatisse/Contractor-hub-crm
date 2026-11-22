import { fillFacts } from "@/shared/lib/fill-facts";
import type { TextBusiness } from "../types";

// The website without https and www, for links in texts.
export function siteOf(url: string): string {
  return (url.split("//").pop() ?? "").split("/")[0].replace("www.", "");
}

// "calls" -> "call", "is" -> "are": the verb after a subject that became "we".
const IRREGULAR: Record<string, string> = { is: "are", has: "have", was: "were", does: "do", goes: "go" };
function weVerb(verb: string): string {
  return IRREGULAR[verb] ?? (verb.length > 3 && verb.endsWith("s") && !verb.endsWith("ss") ? verb.slice(0, -1) : verb);
}

// A business fact the tenant has not filled in is left out of the design's sentence, never replaced by
// a made-up name: "this is {name}" and "to {name}" drop with the clause, and a missing subject
// ("{first} calls", "{first} from {name} visits") becomes "we" with the verb to match.
function leaveOutMissing(text: string, name: string, first: string): string {
  if (name && first) return text;
  const WE = "\uE000";
  let out = text.replace(/\{first\} from \{name\}/g, name ? "{name}" : first ? "{first}" : WE);
  if (!name) out = out.replace(/,? this is \{name\}/g, "").replace(/ (?:to|from|at|with) \{name\}/g, "").replace(/\{name\}/g, WE);
  if (!first) out = out.replace(/\{first\}/g, WE);
  return out
    .replace(new RegExp(`${WE}( +)([a-z]+)\\b`, "g"), (_m, gap: string, verb: string) => `${WE}${gap}${weVerb(verb)}`)
    .replace(new RegExp(WE, "g"), (_m, offset: number, whole: string) => (/(^|[.!?]\s+)$/.test(whole.slice(0, offset)) ? "We" : "we"));
}

// Fills {name}, {first}, {site} and {booking link} from the business record. A missing value is left
// out (see leaveOutMissing; a missing site or booking link drops with its gap).
export function fillText(text: string, business: TextBusiness): string {
  return fillFacts(leaveOutMissing(text, business.name, business.first), {
    businessToken: "name",
    personToken: "first",
    business: business.name,
    person: business.first,
    values: { site: business.site, "booking link": business.bookingLink },
  });
}

// The booking link a text may share: the real "request a job" link, else the website's /book page, else "".
export function bookingLinkOf(jobUrl: string | null, site: string): string {
  return jobUrl ?? (site ? `${site}/book` : "");
}

// Name shown in "Reply to X": the full name for an email contact (often a company), else the first word.
export function replyName(name: string, channel: string): string {
  return channel === "Email" ? name : name.split(" ")[0];
}
