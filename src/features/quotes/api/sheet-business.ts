import { initialsOf } from "./quotes";

export type SheetBusiness = { init: string; name: string; addr: string; phone: string; email: string; site: string; hours: string };

type Facts = {
  business_name: string; business_address: string; business_phone_number: string; business_email: string;
  business_hours: string; business_website_url: string;
};

// The business block at the top of the quote sheet. Facts come from the sub-account's custom values
// ("" when missing), never from code. The site shows without https and www. With no business name the
// sheet shows the frame's own fallback name and initials (`frame`, from useBusiness), like the side menu.
export const sheetBusiness = (v: Facts, frame?: { name: string; init: string }): SheetBusiness => ({
  init: v.business_name.trim() ? initialsOf(v.business_name) : frame?.init ?? "",
  name: v.business_name.trim() ? v.business_name : frame?.name ?? "",
  addr: v.business_address,
  phone: v.business_phone_number,
  email: v.business_email,
  site: v.business_website_url.split("//").pop()!.split("/")[0].replace("www.", ""),
  hours: v.business_hours,
});
