# Settings layout (every custom value, grouped by folder)

Decided by the user on 2026-11-24: Settings shows every custom value a sub-account has, empty ones included, grouped by its HighLevel folder. HighLevel's custom values API returns no folder, so the grouping lives in a checked-in file that Claude (an AI) writes and re-writes when keys change. The app makes no AI call.

## How it works

1. **Read.** On each page load the server reads all custom values of the tenant from HighLevel (`loadSettingsValues`, `src/features/settings/api/load-values.ts`). Blank values count.
2. **Classify (server, security).** `classifyKey` in `src/features/settings/api/allowlist.ts` marks each key `secret` or `shown`. Secret: not `[A-Za-z0-9_]{1,100}`, starts with `0_` or `_`, ends with `_`, or has a secret-looking word (webhook, token, secret, password, api key, embed, credential, private, bank, account or routing number, client id, bearer, oauth, `auth_`, signing, session, or ends in `_key`, `_id`, `_sid`). A secret key's name and value never reach the browser. Writes (`write-back.ts`, `media-route.ts`) re-check with the same function, so every shown key can be saved and no secret key can.
3. **Long values.** A shown value over 2000 characters is not sent. Its key name goes in `AccountLayout.longKeys` and the field shows read-only with "Too long to edit here. Change it in HighLevel". The 2000 cap on edit and save stays.
4. **Place (layout file).** `src/features/settings/api/layout.ts` lists the folders in HighLevel order. Each folder has a humanised title, the HighLevel folder name (data only, never shown), a helper line, and ordered sub-groups. A sub-group has exact `keys`, regex `patterns`, a `repeat` rule (one sub-group per item number, for example "Residential service 3" with its name, page address and page text), or `fallback` patterns. Matching order: exact key, then patterns and repeat rules in file order, then fallbacks, then the catch-all folder "More details".
5. **Log.** Keys no rule places are logged once per load as `Settings layout: unplaced keys=<names>` (names only, never values). That list is the input for the next re-run.
6. **Page.** One step per folder that has keys, in layout order, with its sub-groups as headings. The step count, rail, progress, search and save keys all come from the keys present. Residential services, Commercial services, Service types and Service areas open only behind the unlock step (`ProtectedFolder`). `*content` and `*path` keys (page HTML and URL slugs) show as plain text. Outside a protected folder they are read-only. Branding hex keys keep the color swatch. When the read fails, the essential and color fields still show, empty.

The layout decides only where a key shows. It never makes a key visible or writable.

## Re-running the AI grouping

Do this when the `unplaced keys` log line names keys, or when a snapshot adds or renames folders.

1. Export the key NAMES of one sub-account, with their folder if you can see it in HighLevel (Settings > Custom Values). Never export values.
2. Give Claude the names, the folder list, `src/features/settings/api/layout.ts` and this file. Ask it to place every name, keep existing ids (they are the step ids in the page and in tests), keep titles humanised, and mark every guess with a `GUESS` comment.
3. Review the diff by hand: folder order, the protected flag (only service and area folders), no secret-looking key made to look harmless (the classifier still hides it anyway).
4. Run `pnpm check`. `tests/features/settings/every-value.test.tsx` and `tests/features/settings/folders.test.tsx` pin the layout.

## Guesses in the current layout (not seen in a real account)

- **Four unnamed folders.** The snapshot has 16 folders and only 12 were named. Two are guessed as more website sections (titled "Questions and answers" and "Team", no HighLevel name recorded). The other two are not modelled. Their keys land in "More details" and in the log.
- **07.1_Sections_Partners** (7 values): key names unknown. Guessed as a section title plus a name, logo and link per partner (`partner{n}_name`, `partner{n}_logo`, ...).
- **07.2_Sections_Reviews** (18 values): key names unknown. Guessed as a name, text and stars for six reviews (`review{n}_name`, `review{n}_text`, `review{n}_stars`).
- **07.5_Our-work**: keys `{n}_our_work_before|after` come from earlier code, not a screenshot of that folder.
- **Offer texts** (`referral_reward_text`, `seasonal_offer_text`) are placed in Business essentials ("Offers"). Their real folder is not known.
- **Business essentials sub-groups** and the patterns for unseen business keys (`business_*` fallback) are Claude's structure, not HighLevel's.
- **Service areas**: the key spelling (`bizarea00maincity`, `bizarea{n}`, `...content`, `...path`) was read from a small screenshot (docs/tenant-branding.md). Matt counted 80 values; the catalogue shows 21 numbered areas, so the patterns accept any number.
- **Social links**: networks other than the four known (TikTok, LinkedIn, ...) are guessed patterns.
- **Branding**: a `More branding` fallback for other `*_color` or font keys; the catalogue says there are none today.

## Kept rules

- Keys the brand reader ignores (the second spelling of city or state, `shadowedKeys`) still get no field.
- A key the account no longer has is hidden after a good read.
- Page text with markup cannot be saved: the write path refuses `<`, `>`, quotes and template tags (`value-rules.ts`).
