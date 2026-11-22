// MOCK DATA (Phase 2). The design's sample client. Replaced in Phase 3 by the sub-account's custom
// values (business_name, business_owner_name, business_main_keyword, business_main_city, ...).
// Never treat any value here as a real business fact.
export const MOCK_BUSINESS = {
  business_name: "Northway Roofing",
  business_owner_name: "Mike Dalton",
  business_phone_number: "+1 (614) 555-0100",
  business_email: "office@northwayroofing.example",
  business_address: "1200 Summit St, Columbus, OH 43201",
  business_hours: "Mon - Sat: 7:00 AM - 6:00 PM",
  business_main_city: "Columbus",
  business_main_state_abbreviation: "OH",
  business_main_keyword: "Roofing",
  business_website_url: "https://www.northwayroofing.example",
} as const;
