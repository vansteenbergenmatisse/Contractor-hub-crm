import { fillFacts } from "@/shared/lib/fill-facts";
import type { TextBusiness } from "../types";

// The website without https and www, for links in texts.
export function siteOf(url: string): string {
  return (url.split("//").pop() ?? "").split("/")[0].replace("www.", "");
}

// Fills {name}, {first}, {site} and {booking link} from the business record. A missing name or first
// name reads "our team"; a missing site or booking link is left out.
export function fillText(text: string, business: TextBusiness): string {
  return fillFacts(text, {
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
