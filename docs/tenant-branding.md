# Per-client branding and the installable app

Every sub-account's app shows ITS OWN colors, logo, name, owner and business details. They come from the sub-account's HighLevel custom values, read by the server (`src/features/brand`), never typed into code. The sample business of the design ("Northway Roofing") exists only as marked mock data and is being removed from every page.

## Custom value keys the app reads
Key names read from screenshots of the JCR Landscaping sub-account's custom values on 2026-11-22. Only the key NAMES are recorded here; the client's values are never committed (loop-constraints rule 5). The folder list is not complete: the Business essentials folder has 31 values and the screenshot showed the first 20.

- **01_Business_essentials**: `0_webhook_url_form` (stays on the server), `business_name`, `business_owner_name`, `business_phone_number`, `business_email`, `business_address` (the full address), `business_address_city`, `business_address_state`, `business_hours`, `business_hours_weekdays_open|close`, `business_hours_saturday_open|close`, `business_hours_sunday_open|close`, `business_latitude`, `business_longitude`, `business_logo`, `business_favicon_url`, `universal_cta`. Also read when present (from the design's list): `business_main_keyword`, `business_main_city`, `business_main_state_abbreviation`, `business_website_url`, `business_main_background_video_or_image`.
- **01b_Google_Business_Profile**: `business_google_profile_url`, `google_review_request_url`, `bbb_review_request_url`, `google_maps_embed_src` (its key begins with an underscore in HighLevel: `_google_maps_embed_src`).
- **01c_booking_links**: `request_a_job_booking_link`, `request_a_quote_booking_link`.
- **02_Branding** (14 colors, the font keys are ignored): `main_color`, `main_hover_color`, `main_light_color`, `main_background_color`, `main_border_color`, `sub_color`, `highlight_color`, `error_color`, `background_color`, `section_background_color`, `border_color`, `text_color`, `light_text_color`, `text_on_main_color`.

Different sub-accounts use different spellings for the same thing (the live one has `business_address_city`, the design's sample `business_main_city`). The reader tries the known spellings in order (`src/features/brand/api/build-brand.ts`, `buildProfile`) and shows nothing when none exists: a missing value is never replaced by a made-up one.

## Where each value shows
- Colors: CSS variables printed on `<html>` by the server at first paint, so the first paint already has the client's colors. A main color that fails the 4.5:1 contrast rule against `text_on_main_color` is refused and the key is named.
- Logo: the round mark in the side menu (`BrandLogo`): initials until the image has loaded, initials for good when the link is broken. https links only.
- Favicon: the browser tab icon.
- Name and owner: menu, greeting, tab title, texts. City and state: the tag line under the name.
- Phone, email, address, hours: quotes, invoices and texts. Booking links (`request_a_job_booking_link`, `request_a_quote_booking_link`): Calendar and texts. Google review link: review request texts.
- Settings: the sub-account's real values, including keys the design did not list.

## Installable app (Add to Home Screen)
- Signed-in pages link `GET /api/manifest` (the tenant's name, theme and background colors, standalone display), `GET /api/pwa-icon` (a PNG made from the logo, or the favicon, centered on the main color, or the initials when there is no image; sizes 180, 192, 512 and a maskable variant), an Apple touch icon and the theme color. Signed out gets a neutral manifest.
- The icon is a PNG because iPhone and Android installs need one and the custom values hold SVG or other images.
- Opening the installed app starts at `/`, which signs the person in with their year-long session (or shows `/sign-in`).
- NOT VERIFIED: that the logo image renders in the icon route for every logo type (an SVG on HighLevel's file host is the JCR case; the route falls back to initials on failure); the install prompt on Android Chrome; Add to Home Screen on iOS Safari; that the app opens in standalone mode. Test on a real phone with a connected sub-account.
- No service worker yet, so there is no offline mode and no install banner built by us.
