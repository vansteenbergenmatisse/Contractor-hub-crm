# Per-client branding and the installable app

Every sub-account's app shows ITS OWN colors, logo, name, owner and business details. They come from the sub-account's HighLevel custom values, read by the server (`src/features/brand`), never typed into code. The sample business of the design ("Northway Roofing") exists only as marked mock data and is being removed from every page.

## Custom value keys the app reads
Key names read from screenshots of the JCR Landscaping sub-account's custom values on 2026-11-22. Only the key NAMES are recorded here; the client's values are never committed (loop-constraints rule 5). The folder list is not complete: the Business essentials folder has 31 values and the screenshot showed the first 20.

- **01_Business_essentials**: `0_webhook_url_form` (stays on the server), `business_name`, `business_owner_name`, `business_phone_number`, `business_email`, `business_address` (the full address), `business_address_city`, `business_address_state`, `business_hours`, `business_hours_weekdays_open|close`, `business_hours_saturday_open|close`, `business_hours_sunday_open|close`, `business_latitude`, `business_longitude`, `business_logo`, `business_favicon_url`, `universal_cta`. Also read when present (from the design's list): `business_main_keyword`, `business_main_city`, `business_main_state_abbreviation`, `business_website_url`, `business_main_background_video_or_image`, `business_main_county` (Leads service area). Offer texts read when present: `seasonal_offer_text`, `referral_reward_text` (Automations lines).
- **01b_Google_Business_Profile**: `business_google_profile_url`, `google_review_request_url`, `bbb_review_request_url`, `google_maps_embed_src` (its key begins with an underscore in HighLevel: `_google_maps_embed_src`).
- **01c_booking_links**: `request_a_job_booking_link`, `request_a_quote_booking_link`.
- **02_Branding** (14 colors, the font keys are ignored): `main_color`, `main_hover_color`, `main_light_color`, `main_background_color`, `main_border_color`, `sub_color`, `highlight_color`, `error_color`, `background_color`, `section_background_color`, `border_color`, `text_color`, `light_text_color`, `text_on_main_color`.

Different sub-accounts use different spellings for the same thing (the live one has `business_address_city`, the design's sample `business_main_city`). The reader tries the known spellings in order (`src/features/brand/api/build-brand.ts`, `buildProfile`) and shows nothing when none exists: a missing value is never replaced by a made-up one.

## Where each value shows
- Colors: CSS variables printed on `<html>` by the server at first paint, so the first paint already has the client's colors. A main color that fails the 4.5:1 contrast rule against `text_on_main_color` is refused and the key is named.
- Logo: the round mark in the side menu (`BrandLogo`): initials until the image has loaded, initials for good when the link is broken. https links only.
- Favicon: the browser tab icon.
- Name and owner: menu, greeting, tab title, texts. City and state: the tag line under the name.
- Phone, email, address, hours: quotes, invoices and texts. Hours: `business_hours` wins when set. When it is empty, the line is built from `business_hours_weekdays|saturday|sunday_open|close` (24-hour `HH:MM`) in the design's wording, for example `Mon - Fri: 8:00 AM - 5:00 PM, Sat: 9:00 AM - 1:00 PM`. Neighbouring days with the same hours share a range. A day with a missing, malformed or contradictory value is left out, and "Closed" shows only when a value says it. Booking links (`request_a_job_booking_link`, `request_a_quote_booking_link`): Calendar and texts. Google review link: review request texts.
- Settings: the sub-account's real values, including keys the design did not list.

## Installable app (Add to Home Screen)
- Signed-in pages link `GET /api/manifest` (the tenant's name, theme and background colors, standalone display), `GET /api/pwa-icon` (a PNG made from the logo, or the favicon, centered on the main color, or the initials when there is no image; sizes 180, 192, 512 and a maskable variant), an Apple touch icon and the theme color. Signed out gets a neutral manifest.
- The server fetches the logo itself with limits (https, host allowlist: `assets.cdn.filesafe.space` plus `LOGO_HOST_ALLOWLIST`, no redirects, 4 second timeout, 512 KB cap, image content types only) and passes it to the renderer as a data URI; anything else gives the initials. The icon response is private and not cached.
- The icon is a PNG because iPhone and Android installs need one and the custom values hold SVG or other images.
- Opening the installed app starts at `/`, which signs the person in with their year-long session (or shows `/sign-in`).
- NOT VERIFIED: that the logo image renders in the icon route for every logo type (an SVG on HighLevel's file host is the JCR case; the route falls back to initials when the logo fails the checks below); the install prompt on Android Chrome; Add to Home Screen on iOS Safari; that the app opens in standalone mode. Test on a real phone with a connected sub-account.
- No service worker yet, so there is no offline mode and no install banner built by us.

## Personal sign-in link (`/sign-in?client=<slug>`)

The owner chose a personal link per client for branding before login. `/admin/clients` shows each client's link with a copy button (admin only).

- **Cosmetic only.** The link grants nothing and is not sent to sign-in. A person's tenant comes only from their account.
- **Public fields (allowlist):** business name (control and invisible format characters removed), logo, the brand colors, and the background from `business_main_background_video_or_image` when its path ends in png, jpg, jpeg, webp, gif or avif. A video or anything else shows no background. Nothing else from the custom values reaches the page.
- **Safety:** colors are hex only and follow the contrast rule; images must pass `safeHttpsUrl` and the logo host allowlist (`assets.cdn.filesafe.space` plus `LOGO_HOST_ALLOWLIST`).
- **Neutral page:** an unknown, malformed, uninstalled or disconnected client, a missing table, a slow lookup (3 seconds) or a failed HighLevel read all render the plain page, identical to having no `client`. A malformed value causes no lookup.
- **Load limits (per server instance):** custom values through the 5-minute brand cache, one slug lookup per minute per slug, 300 new lookups per minute, and a one-minute wait after a failed HighLevel read. An uninstall can take up to a minute to show.
- **No token side effects:** a signed-out visit reads custom values only with the stored, unexpired token. It never refreshes or mints a token, takes a lock, retries, or changes connection state, and a 401 marks nothing. Otherwise it shows the last branding cached on that server instance, or the neutral page.
- **Between pages:** sign-in, forgot password and reset keep the validated slug as a query value on fixed paths. It is never a redirect target.
- **Slug:** table `TenantSignInLink` (unique slug, unique tenant, migration `20261122210000_tenant_sign_in_link`, not applied yet). Made from the tenant name when an admin opens `/admin/clients`, with `-2`, `-3` on a collision. It does not change when the business is renamed. Until the migration is applied, every link shows the neutral page and admin works without links.
- NOT VERIFIED: the page in a real browser with a real client's values, and that a client's background value has an image file extension (one without is treated as "anything else").

## Direction from the user (2026-11-22)

Every client is set up by creating a HighLevel sub-account and filling in its custom values; the app must then take everything from them: colors, font, logo, favicon, sign-in background, business details and connection states. JCR Landscaping is the reference sub-account for the key list. Not yet wired (see PROGRESS.md Next up 00): the font keys, the sign-in background (`business_main_background_video_or_image` is parsed but unused), connection states (Settings shows mock statuses), and branding on the signed-out sign-in page.

## Custom value key catalogue (from the user's screenshots of JCR Landscaping, 2026-11-22)

Every client sub-account has these keys; only the values differ. Key names only here, never client values. Write a key in code exactly as listed (the HighLevel key, without `{{custom_values.` and `}}`).

- **01_Business_essentials(NAP+logo+email)**, 31 keys, of which page 1 (20) was shown: `0_webhook_url_form` (server only), `business_email`, `business_favicon_url`, `business_address` (shown as "Business_full_address"), `business_hours`, `business_logo`, `business_name`, `business_owner_name`, `business_phone_number`, `universal_cta`, `business_address_city`, `business_address_state`, `business_hours_saturday_open|close`, `business_hours_sunday_open|close`, `business_hours_weekdays_open|close` (24-hour `HH:MM`), `business_latitude`, `business_longitude`. The other 11 keys (page 2) were NOT shown: still needed.
- **03.1_Residential_Services**, 61 keys: `residentialservice00content`, then for n = 1..20: `residentialservice{n}` (service name), `residentialservice{n}content` (HTML article, schema.org Service), `residentialservice{n}path` (URL slug, e.g. `residential-services/<slug>`). Numbers are NOT zero-padded in the keys (`residentialservice1`), while the display names are (`residential-service-01`). Empty values = unused slots.
- **03.2_Commercial_Services**, 61 keys: same pattern, prefix `commercialservice` (`commercialservice00content`, `commercialservice{n}`, `commercialservice{n}content`, `commercialservice{n}path`, n = 1..20).
- **04_Service-Types**, 31 keys: `0_servicetypename` (the group's title), then for n = 01..10 (zero-padded here): `servicetype{nn}`, `servicetype{nn}content`, `servicetype{nn}path`.
- **Service areas (cities)** folder (name partly unreadable in the screenshot, looks like `05_Service-Areas-(cities)`): display names `biz-area-00-main-city`, `-main-city-content`, `-main-county`, `-main-county-content`, `-main-county-path`, then `biz-area-01` .. `biz-area-21` each with `-content` and `-path`. The KEY spelling was too small to read with certainty (looks like `bizarea00maincity`, `bizarea00maincounty`, `bizarea{n}`, `bizarea{n}content`, `bizarea{n}path`): confirm before use.
- **02_Branding** (confirmed by screenshot 2026-11-22, 14 of 14): `background_color`, `border_color`, `error_color`, `highlight_color`, `light_text_color`, `main_background_color`, `main_border_color`, `main_color`, `main_hover_color`, `main_light_color`, `section_background_color`, `sub_color`, `text_color`, `text_on_main_color`. All hex. There are NO font keys in this folder, so the font is not a custom value today (the app keeps the design font unless the user adds a font key). Also not shown: a sign-in background key other than `business_main_background_video_or_image`, and any keys for connection states.

Use in the app (plan, not built): service names (residential, commercial, service types) feed the service choices in Leads, Quotes and Pipeline and the search; service areas feed the Leads service area line and Settings; `*content` (HTML) is website copy and is never rendered as HTML in the CRM (XSS) and never sent to the browser unless shown as plain text; `*path` slugs are website links and only used as text or with the client's own https website URL.
