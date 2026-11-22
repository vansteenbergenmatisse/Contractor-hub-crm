import type { TextBusiness } from "../types";

// The website without https and www, for links in texts.
export function siteOf(url: string): string {
  return (url.split("//").pop() ?? "").split("/")[0].replace("www.", "");
}

// Fills {name}, {first} and {site} from the business record.
export function fillText(text: string, business: TextBusiness): string {
  return text.replaceAll("{name}", business.name).replaceAll("{first}", business.first).replaceAll("{site}", business.site);
}

// Name shown in "Reply to X": the full name for an email contact (often a company), else the first word.
export function replyName(name: string, channel: string): string {
  return channel === "Email" ? name : name.split(" ")[0];
}
