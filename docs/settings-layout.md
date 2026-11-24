# Settings layout (every custom value, grouped by folder)

Decided by the user on 2026-11-24: Settings shows every custom value a sub-account has, empty ones included, grouped by its HighLevel folder. HighLevel's custom values API returns no folder, so the grouping lives in a checked-in file that Claude (an AI) writes and re-writes when keys change. The app makes no AI call.

## How it works

1. **Read.** On each page load the server reads all custom values of the tenant from HighLevel (`loadSettingsValues`, `src/features/settings/api/load-values.ts`). Blank values count.
2. **Classify (server, security).** `classifyKey` in `src/features/settings/api/allowlist.ts` marks each key `secret` or `shown`. Secret: not `[A-Za-z0-9_]{1,100}`, starts with `0_` or `_`, ends with `_`, or has a secret-looking name (the `DENY` list in that file). A secret key's name and value never reach the browser. Writes (`write-back.ts`, `media-route.ts`) re-check with the same function, so no secret key can be saved.
   - `DENY` words anywhere in the name: webhook, hook, endpoint, callback, token, secret, passw, passcode, pwd, credential, private, embed, bearer, signature, jwt, hmac, dsn, database, smtp, captcha, stripe, api key, client id, bank, account or routing number, card number, cvv, cvc, tax or VAT number, social security, pin code, `auth` (not the word `author`).
   - As a whole part of the name (between `_`, digits or the ends): key, pass, pin, otp, ssn, ein, pit, salt, sid, session, signing, sk, rk, pk, ssh, id. Also any name ending in `key`, `keys` or `key<digits>`.
   - **Values are checked too** (`isSecretValue`): Stripe and other token prefixes (`sk_live_`, `rk_`, `pk_live_`, `xox?-`, `ghp_`, `pit-`), JWTs, AWS and Google keys, private key blocks, webhook hosts and paths (`hooks.*`, Make, n8n, Pipedream, `/webhook/`, `/hooks/`), and links with a user name and password. Such a key is kept on the server like a secret name, and a save refuses to write such a value.
   - Hidden key names (never values) are logged once per load as `Settings layout: hidden keys=<names>`.
   - **Residual risk (default-allow).** Before 2026-11-24 only an exact list of keys showed (default-deny). Now every key that the checks above do not catch shows and can be saved. A credential stored under a harmless name with a value of no known shape (for example a plain door code in `door_code_text`) reaches the owner and can be overwritten. Non-secret agency settings such as `notification_email` are also shown and writable. Agencies must not keep credentials in custom values unless the name matches `DENY`. Admin locking of single keys is a later wave.
3. **Long values.** A shown value over 2000 characters is not sent. Its key name goes in `AccountLayout.longKeys` and the field shows read-only with "Too long to edit here. Change it in HighLevel". The 2000 cap on edit and save stays. The server refuses to save a key whose current value is over 2000 characters (answer `denied`, without the value), so a crafted save cannot read it back.
3a. **Who may write what (server).** `writeGuardOf` (`src/features/settings/api/write-guard.ts`): a key of a protected folder (Residential and Commercial services, Service types, Service areas) is written only by a save that names that folder as `unlocked`; the page sends it from the folder's unlock step. A `*content` or `*path` key outside a protected folder is never written. Everything else shown is open. The unlock is sent by the browser, so it keeps stale tabs and ordinary step saves away from those keys; it does not stop an owner who builds a request by hand, who is allowed to change them through the unlock step anyway.
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

## Image picker (Wave C, 2026-11-24)

- **Which keys.** `isImageKey` (`src/features/settings/api/image-keys.ts`) is the one rule used by the preview, the picker and the server image route (`media-route.ts`): the logo, favicon, background and our-work keys, plus any key whose last part is logo, favicon, background, image, img, photo, picture, pic, banner, hero, thumbnail, avatar or headshot (optionally followed by `_url` or `_src`; not `_link`, which is usually a button link, and not `bg`, which is often a color), or that ends in `_before_`/`_after_` + image or photo. An empty value gets the picker too ("Add image").
- **Compression.** Every photo is re-encoded in the browser (`prepare-image.ts`): WebP, or JPEG where the browser cannot write WebP; longest side at most 2400; quality lowered until it is at most 2 MB. The preview line shows the size before and after. The server re-checks the bytes (PNG, JPEG, WebP, SVG checks).
- **Logo and favicon.** Today SVG only. The user decided (2026-11-24) they may also take a photo; the code for it is in place behind `LOGO_ACCEPTS_PHOTO` (`image-keys.ts`, read by the page and the server), which stays `false` until two tests that pin SVG-only are changed with the user's approval.
- **Where the file goes.** A value that holds a library file: the existing replace (same name, same folder, see `media-replace.ts`). An empty value: a plain upload named `<key>.<ext>` into the library folder named after the layout folder's HighLevel name (`mediaFolderOf`), found by exact name (the top-level one if the name is used more than once) or created at the top of the library; a layout folder with no HighLevel name puts the file at the top. A non-empty value that is no library file (a pasted link or one hosted elsewhere) is handled the same way; the old link's file is never touched. Then the link is written to the value. If the create gets no clear answer the library is read once more and a folder that did land is used. Every folder create opens and closes an audit row (`folder:<name>`, actor, tenant, outcome).
- **Remove.** Empties the field; the step's normal save, with its confirm-clear step, clears the value. The media file is never removed.
- **Gating.** The picker shows when media replace is on for the tenant (`isMediaReplaceEnabled`) and the owner can save. Otherwise the field says why (uploads off, or saving off). View as client shows neither. In a protected folder the picker shows only after the unlock and the upload carries the folder's unlock, which the route checks with `writeGuardOf`.

- **Boundary change (needs the user's approval before enabling).** Until this wave only the admin template copy created library folders. Now an owner's image upload can create one folder (the layout folder's name) in its own sub-account. Rolling back (`SETTINGS_MEDIA_REPLACE_*` off) does not remove folders already created. Not verified against HighLevel: that the installed OAuth scopes allow `POST /medias/folder` from this route, the create answer's id, that an upload with `parentId` lands in that folder, and that names like `01_Business_essentials(NAP+logo+email)` are accepted. Check on a sandbox location before turning media replace on for a tenant.
- **Known gaps.** Two top-level folders with the same name stop every add for that folder (`ambiguous`) until one is removed in HighLevel. Bare `hero`, `banner` and `background` key endings are still images; check the live key catalogue for text keys with those endings.

## Kept rules

- Keys the brand reader ignores (the second spelling of city or state, `shadowedKeys`) still get no field.
- A key the account no longer has is hidden after a good read.
- Page text with markup cannot be saved: the write path refuses `<`, `>`, quotes and template tags (`value-rules.ts`). So in practice only `*path` keys and plain page text under 2000 characters can be changed behind the unlock step. Open decision for the user.

## Numbering

Numbered keys start at 1. `bizarea00`, `residentialservice0` and similar keys with item 0 are not placed by the repeat rules; they go to "More details" and the unplaced log.
