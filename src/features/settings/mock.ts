// MOCK DATA (Phase 2). The design's sample custom values and sample connection status. Replaced in
// Phase 3 by the sub-account's custom values and by the status an API gives. Never treat any value
// here as a real business fact.
import { MOCK_BUSINESS } from "@/shared/mock/business";
import type { ConnectionStatus, CustomValues } from "./types";

export const MOCK_CUSTOM_VALUES: CustomValues = {
  business_name: MOCK_BUSINESS.business_name,
  business_owner_name: MOCK_BUSINESS.business_owner_name,
  business_phone_number: MOCK_BUSINESS.business_phone_number,
  business_email: MOCK_BUSINESS.business_email,
  business_address: MOCK_BUSINESS.business_address,
  business_hours: MOCK_BUSINESS.business_hours,
  business_main_city: MOCK_BUSINESS.business_main_city,
  business_main_county: "Franklin County",
  business_main_state_abbreviation: MOCK_BUSINESS.business_main_state_abbreviation,
  business_main_keyword: MOCK_BUSINESS.business_main_keyword,
  business_website_url: MOCK_BUSINESS.business_website_url,
  universal_cta: "Get A Free Quote",
  business_logo: "",
  business_favicon_url: "",
  business_main_background_video_or_image: "",
  referral_reward_text: "You get $25 off your next visit for every friend who books.",
  seasonal_offer_text: "Fall roof checks are booking now. Get on the list before the first storm.",
  main_color: "#2E7D32",
  main_hover_color: "#256528",
  main_light_color: "#4AA44E",
  main_background_color: "#EAF5E6",
  main_border_color: "#BEDEB6",
  sub_color: "#0F2740",
  highlight_color: "#F5A524",
  error_color: "#B3261E",
  background_color: "#FFFFFF",
  section_background_color: "#F1F5F8",
  border_color: "#D0DAE2",
  text_color: "#4A5A6B",
  light_text_color: "#5E6E7E",
  text_on_main_color: "#FFFFFF",
};

// Same order as CONNECTIONS in api/fields.ts: phone, calendar, Facebook, Instagram, Google My Business, payments.
export const MOCK_CONNECTION_STATUS: ConnectionStatus[] = [
  { connected: true, a2pVerified: true },
  { connected: true, note: "Connected: Google Calendar" },
  { connected: true },
  { connected: false },
  { connected: true },
  { connected: false },
];

// Both switches start On, as in the design.
export const MOCK_SWITCHES: [boolean, boolean] = [true, true];
