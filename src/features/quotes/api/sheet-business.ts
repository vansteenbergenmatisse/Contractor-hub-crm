import { initialsOf } from "./quotes";

export type SheetBusiness = { init: string; name: string; addr: string; phone: string; email: string; site: string; hours: string; logo: string | null };

type Facts = {
  business_name: string; business_address: string; business_phone_number: string; business_email: string;
  business_hours: string; business_website_url: string;
};

// The business block at the top of the quote sheet. Facts come from the sub-account's custom values
// ("" when missing), never from code. The site shows without https and www. The sheet is what the
// customer gets, so a missing name shows no name and no initials, never a made-up one (like the invoice sheet).
// `logo` is the business logo link from the shell (already checked to be https), or null.
export const sheetBusiness = (v: Facts, logo: string | null = null): SheetBusiness => ({
  init: initialsOf(v.business_name),
  name: v.business_name.trim(),
  addr: v.business_address,
  phone: v.business_phone_number,
  email: v.business_email,
  site: v.business_website_url.split("//").pop()!.split("/")[0].replace("www.", ""),
  hours: v.business_hours,
  logo,
});
