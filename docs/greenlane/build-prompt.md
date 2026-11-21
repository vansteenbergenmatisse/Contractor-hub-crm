# Build prompt: GreenLane v2 contractor dashboard in Next.js

Copy everything below this line into your coding agent. Attach `greenlane-dashboard.html` with it.

Updated 20 Nov 2026. The HighLevel apps are set up (section 14). Sign-in, install model, routes, webhooks and env vars are decided. This file replaces the separate "Phase 2 build" prompt.

---

## 1. Your job

Build a production web app in Next.js from the attached file `greenlane-dashboard.html`.

- Before you change any code: read `CLAUDE.md`. Then show Matt your plan as bullets and sub-bullets. Wait for his go.
- Work in the existing CRM repo (Next.js, Prisma 7, TypeScript, pnpm, Postgres on Neon). Branch flow: develop, then staging, then main. Schema changes follow the same path.
- The HTML file is the spec. It holds every page, every state and every motion. Open it in a browser and click through it before you write code.
- The file runs on a small stand-in runtime with `{{holes}}`. Do not port that runtime. Read the markup, the CSS and `class Component` as the spec, then rebuild it as React components.
- `?s={"page":"inbox"}` at the end of the file URL opens any page. Page keys: login, today, inbox, calendar, pipeline, leads, quotes, invoices, payments, automations, settings.
- Every place that needs real data carries a `// BACKEND` comment in the script. Search the file for "BACKEND". Section 9 of this prompt lists all of them.
- All sample data is fake. "Northway Roofing" in Columbus, OH is a sample client. Replace every sample with live data from GoHighLevel.
- One design change: the sign-in screen uses email and password (section 4), not "Continue with GoHighLevel".

## 2. The product in one paragraph

Forge Forward runs websites and GoHighLevel sub-accounts for home-service contractors (roofers, lawn care crews, plumbers). This app is the contractor's dashboard. The contractor never opens GoHighLevel. He opens this app on his phone between jobs. Every page answers one question: what needs me, and what do I press. Leads come in from the website, calls, texts, Facebook, Instagram and Google My Business. The app shows who waits, lets him reply, books visits, sends quotes and invoices, and chases payments. GoHighLevel workflows do the follow-up work in the background.

Who it is for: one owner (and later his office person) of one sub-account. Who it is not for: agency staff managing many clients. They keep using GoHighLevel. Forge Forward staff get one plain admin page (section 4.8).

## 3. Hard rules (never break these)

1. The browser never holds a GoHighLevel token or secret. Every call goes browser -> your Next.js server -> GoHighLevel.
2. One client never reaches another client's data. Resolve the tenant and its `locationId` from the server session. Never accept a `locationId` from the browser. Scope every query, every cache key and every database row by tenant.
3. Never change the name (key) of a GoHighLevel custom value. The client's website reads the same keys. The app may change values only.
4. The business name, owner name, phone, email, address and website always come from custom values. Never bake them into code or copy. This also holds inside sample message text and links.
5. All brand colors and the logo come from the sub-account's custom values (section 5). A changed value recolors every page.
6. Refuse a `main_color` whose contrast with `text_on_main_color` is under 4.5 to 1. Say which key is wrong.
7. Never draw brand logos by hand (Google, Facebook, Instagram). Use the official logo files, or a plain icon plus the word.
8. Say "Google My Business" for that lead source and that connection.
9. A feature the system does not have shows a "Not available yet" chip and no working switch.
10. A send (quote or invoice) waits 20 seconds on the server. Cancel in that window sends nothing. After 20 seconds it can not come back.
11. Never invent business facts, prices, reviews or results.
12. Never put "ghl", "highlevel" or "leadconnector" in a URL that HighLevel stores (redirect, webhook, Custom Page). HighLevel refuses them. Use the routes in section 11.1.
13. Test and live use separate HighLevel apps. Never share a token between environments, because each refresh kills the old refresh token.
14. Read secrets from environment variables only. Never log them. Never prefix them with `NEXT_PUBLIC_`.

## 4. Sign-in and the HighLevel connection

### 4.1 Decisions (20 Nov 2026)

| Topic | Decision |
|---|---|
| Install | Forge Forward installs the live app once from its agency and picks "all sub-accounts". Every new client sub-account then gets the app by itself. Clients never click Connect. |
| Login on phone and computer | Email and password with Better Auth (Prisma adapter, Neon). Invite only, no open sign-up. The email must belong to a user of that client's sub-account. |
| Login inside GoHighLevel | The "CRM" Custom Page in the sub-account's left menu. It signs the user in with HighLevel's signed user data. No second login. |
| HighLevel apps | "Forge Forward CRM Test" for staging and dev. "Forge Forward CRM" for production. Settings in section 14. |

### 4.2 OAuth facts (checked in the official docs, 20 Nov 2026)

- Token endpoint: `POST https://services.leadconnectorhq.com/oauth/token`, form-encoded. `user_type` is `Company` (agency) or `Location` (sub-account).
- Access tokens last about 24 hours. A refresh token lasts 1 year or until used. Every refresh returns a new refresh token and kills the old one.
- Install code: single use, expires after 5 minutes. `redirect_uri` must match a registered one exactly. Send a single-use `state` bound to the session and reject the callback if it does not match. PKCE is not supported.
- The agency bulk install returns `userType: "Company"` and `isBulkInstallation: true`. Then get the locations where the app is installed (scope `oauth.readonly`) and mint a location token for each.
- Location token from the agency token: `POST /oauth/location-token` with header `Version: v3`, form body `companyId` + `locationId`. Older docs show `/oauth/locationToken` with `Version: 2021-07-28`. Needs scope `oauth.write`. The v3 response includes a `refresh_token`. If one is missing, re-mint from the agency token when it expires.
- Other endpoints: send the `Version` header each endpoint's docs ask for (most use `2021-07-28`). Confirm every endpoint in the current docs before you code it.
- The official TypeScript SDK `@gohighlevel/api-client` exists. Check whether it saves work before you write your own client.

### 4.3 Install routes

- `/api/integrations/oauth/start`: admin only. Builds the install URL (`https://marketplace.gohighlevel.com/oauth/chooselocation` with `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`).
- `/api/integrations/oauth/callback`: checks `state`, exchanges the code with `user_type=Company`, stores the agency token, lists installed locations, mints a token per location and creates a tenant per location.

### 4.4 Webhook route `/api/integrations/webhooks`

- Read the raw body first. Verify the `X-GHL-Signature` header (Ed25519) with HighLevel's public key from the Webhook Integration Guide. The legacy `X-WH-Signature` (RSA) was deprecated on 1 Sep 2026. Reject on failure. Parse JSON only after verification.
- Check `appId` matches this environment's app.
- Idempotent: store each `webhookId` and skip repeats.
- `INSTALL` (type `Location`): mint the location token and create the tenant. `UNINSTALL`: delete that location's tokens and mark the tenant `uninstalled`. An agency-level `UNINSTALL` (only `companyId`) also deletes the agency token.
- All other events: store them, update caches and push to open screens with server-sent events. Fall back to a 60-second refetch.

### 4.5 Who is signed in inside GoHighLevel (`/embed`)

- `/embed` posts `{ message: "REQUEST_USER_DATA" }` to `window.parent` and listens for `REQUEST_USER_DATA_RESPONSE`. It sends `data.payload` to the server.
- The server decrypts it with CryptoJS AES and `GHL_APP_SHARED_SECRET`. The result holds `userId`, `email`, `activeLocation`, `companyId`, `role` and `type`. Ignore unknown keys, because HighLevel adds fields over time.
- Match `email` + `activeLocation` to a CRM user and tenant, start a session and open Today. No match: show "Ask Forge Forward for access".
- `/embed` runs inside an iframe. Never send `X-Frame-Options` on it. Set CSP `frame-ancestors` to allow `https://app.gohighlevel.com`, `https://app.leadconnectorhq.com` and the agency's white-label domain. The session cookie there needs `SameSite=None; Secure`. Test whether `Partitioned` is needed too.

### 4.6 Login on the phone and computer

- Better Auth email and password. Invite only.
- The invite checks that the email belongs to a user of that sub-account (users API, `users.readonly`).
- Routes: `/sign-in`, `/forgot-password`, `/invite/[token]`. Session cookie: httpOnly, Secure, SameSite=Lax. "Keep me signed in" sets a long session.
- Invites and password resets need an email sender (open question, section 12).
- Never store or ask for GoHighLevel passwords.

### 4.7 Database (Prisma on Neon)

- `Tenant`: one client company, linked to one GoHighLevel `locationId` (unique). Status: `connected`, `needs_reconnect`, `uninstalled`.
- Better Auth user tables. Each user belongs to one tenant. Roles: `owner`, `office`, `admin` (Forge Forward staff).
- `HlAgencyConnection`: `companyId`, encrypted access and refresh token, expiry.
- `HlLocationConnection`: `tenantId`, `locationId`, encrypted tokens, expiry.
- `WebhookEvent`: `webhookId` (unique), type, `locationId`, received at, processed at.
- Encrypt tokens at rest with AES-256-GCM and `TOKEN_ENCRYPTION_KEY`.

### 4.8 Token service and admin page

- `getLocationToken(tenantId)`: refresh or re-mint when less than 5 minutes are left.
- One refresh at a time per token: a Postgres advisory lock or `SELECT ... FOR UPDATE`. Retry a call once on 401 after a refresh.
- On `invalid_grant`: mark the tenant `needs_reconnect` and show a Reconnect banner.
- `/admin/clients` (role `admin` only, plain styling is fine): every tenant with Connected, Needs reconnect or Uninstalled. Buttons: Invite owner, Turn off login.

## 5. Custom values: brand, logo and business details

Read the sub-account's custom values at sign-in (scope `locations/customValues.readonly`). Write them into CSS variables on the app root, rendered on the server, so the first paint already has the client's colors. Settings saves with `locations/customValues.write`.

**Folder 01_Business_essentials (keys never change):**
`business_name`, `business_owner_name`, `business_phone_number`, `business_email`, `business_address`, `business_hours`, `business_main_city`, `business_main_county`, `business_main_state_abbreviation`, `business_main_keyword`, `business_website_url`, `universal_cta`, plus `business_logo`, `business_favicon_url`, `business_main_background_video_or_image`, `referral_reward_text`, `seasonal_offer_text`. The form webhook lives in `0_webhook_url_form`. Keep that URL on the server.

**Folder 02_Branding (colors only, ignore the font keys):**
`main_color`, `main_hover_color`, `main_light_color`, `main_background_color`, `main_border_color`, `sub_color`, `highlight_color`, `error_color`, `background_color`, `section_background_color`, `border_color`, `text_color`, `light_text_color`, `text_on_main_color`.

| Rule | How |
|---|---|
| Color to CSS | Each key maps to the variable with the same name, underscore to dash. `main_color` sets `--main-color`. `text_color` also sets `--normal-text-color`. |
| Logo | `business_logo` replaces the initials once the image loads. A broken link keeps the initials. Accept https links only. |
| Favicon | `business_favicon_url` sets the tab icon. |
| Sign-in background | `business_main_background_video_or_image` fills the sign-in page. Videos (mp4, webm, mov) are not used there. |
| Where values show | business_name: menu, sign in, texts, quotes, invoices. business_owner_name: greeting, menu, texts. Phone, email, address: quotes and invoices. Website: booking link `{business_website_url}/book`. |
| Saving | Settings writes one value back to GoHighLevel on Save. The website changes too. Ask Forge Forward to confirm this before launch. |
| Cache | Cache per tenant. Revalidate when Settings saves or a `LocationUpdate` webhook arrives. |

Use `next/image` for the logo with remote patterns limited to the GoHighLevel media hosts you see in real data.

## 6. Data: dashboard thing to GoHighLevel object

| In the app | GoHighLevel object | Scopes | Notes |
|---|---|---|---|
| Lead, customer | Contact | `contacts.readonly`, `contacts.write`, `locations/tags.readonly`, `locations/customFields.readonly` | Source label: Call, Text, Email, Web form, Facebook, Instagram, Google My Business. |
| Inbox row, message | Conversation, message | `conversations.readonly`, `conversations.write`, `conversations/message.readonly`, `conversations/message.write` | Reply on the same channel. "Needs reply" drives the red count. Mark done and Flag for reply update the conversation. |
| Pipeline card | Opportunity in the client's pipeline | `opportunities.readonly`, `opportunities.write`, `pipelines.readonly` | 11 stages (section 7). |
| Calendar stop | Calendar appointment / event | all 8 calendar scopes | Estimate (visit) or job. Two-way sync with Google Calendar or Outlook. |
| Quote | Estimate | `invoices/estimate.readonly`, `invoices/estimate.write` | "Opened" comes from the estimate status Viewed. HighLevel has no estimate webhook, so check the status of sent quotes on a timer. |
| Invoice | Invoice | `invoices.readonly`, `invoices.write` | Created when a job is marked done. Due 7 days after sending (placeholder). |
| Payment due | Invoice payment status, transactions | `invoices.readonly`, `payments/transactions.readonly` | Paid invoices mark themselves paid once online payments connect. |
| Automation | Workflow | `workflows.readonly`, `.write`, `.publish`, `.delete`, `.logs` | Grouped by the GoHighLevel workflow folders. Section 7. |
| Business details, brand | Custom values | `locations/customValues.readonly`, `.write`, `locations.readonly` | Section 5. |
| Phone number | LC Phone number | `phonenumbers.read` | Shows the number. No API found for A2P status or the 4 Trust Center checks: show "Not available yet" there until confirmed. |
| Facebook, Instagram, Google My Business connection | Social Planner accounts | `socialplanner/account.readonly` | Connected or not. |
| Owner and office users | Users | `users.readonly` | Login email check. `UserUpdate` and `UserDelete` webhooks keep logins in step. |

Webhooks turned on in both apps (exact HighLevel names): `AppointmentCreate`, `AppointmentUpdate`, `AppointmentDelete`, `ContactCreate`, `ContactUpdate`, `ContactDelete`, `ContactTagUpdate`, `ConversationUnreadUpdate`, `ConversationUpdate`, `InboundMessage`, `OutboundMessage`, `InvoiceCreate`, `InvoiceUpdate`, `InvoiceSent`, `InvoicePaid`, `InvoicePartiallyPaid`, `InvoiceVoid`, `InvoiceDelete`, `LocationUpdate`, `OpportunityCreate`, `OpportunityUpdate`, `OpportunityDelete`, `OpportunityStatusUpdate`, `OpportunityStageUpdate`, `UserUpdate`, `UserDelete`. `INSTALL` and `UNINSTALL` arrive at the same URL. Handle them as section 4.4 says.

## 7. The pipeline and the automations behind it

The pipeline has 11 stages in this order. A card moves by its button, by "Job done", by the reason sheet, or by a workflow. When a card changes stage, the app updates the opportunity's `pipelineStageId` in GoHighLevel. GoHighLevel then fires the workflows that use the trigger "Pipeline Stage Changed". The app never sends those texts itself.

| Stage | Main button (moves to) | What the system does next |
|---|---|---|
| New Lead | Book visit (Estimate Booked) | Follow-up texts today |
| Following Up | Book visit (Estimate Booked) | Chase texts run |
| Estimate Booked | Visit done (Quote to Send) | Reminder texts go out |
| Quote to Send | Approve (Quote Sent) | AI quote waits for you |
| Quote Sent | Accepted (Job to Schedule) | Follow-up texts run |
| Job to Schedule | Book job (Job Scheduled) | Booking link sent |
| Job Scheduled | Job done (Job Done) | Reminder the day before |
| Job Done | Invoice (Payment Due) | Review request (1 hour after), referral ask (1 day after), invoice created |
| Payment Due | Mark paid (Check Back Later) | Payment reminders run |
| Check Back Later | Reopen (New Lead) | Check-in texts run |
| Lost | Reopen (New Lead) | Every text stopped |

Extra rules:
- Every card before Job Done has a "Job done" button. It jumps straight to Job Done, with Undo, because owners forget to move cards stage by stage.
- The trash icon opens the reason sheet: Ask again later (moves to Check Back Later), Said no, Chose a competitor, Not a fit, Opted out (move to Lost and store the reason). No trash icon on Payment Due and Lost cards.
- "Send quote" and "Invoice" open the 20-second send timer. A card moved by a send has no Undo.
- Stage tags: quote opened or not, lost reason, accepted, first-time or returning customer, left a review, days late.

The automations page lists the sub-account workflows. Each row reads When / Does / Stops, who acts (Runs on its own, You start it, Waits for your OK) and how often it ran this week. Sample set in the file: Lead capture, Instant reply and same-day follow-ups, Owner ping, Later-day chase, Online booking, Estimate reminders, Quote follow-up, Booking link after a yes, Job reminder, Invoice and payment reminders, Check-in texts, Stop on Lost, Thank-you and review request, Referral ask, Review campaign to old leads, Promotion campaign, AI quote builder.

The workflow API now supports the whole editor. The app has these scopes:
- `workflows.readonly`: list workflows.
- `workflows.write`: create, update and validate workflows (New automation, Edit).
- `workflows.publish`: publish or revert to draft. The on/off switch maps to publish and draft.
- `workflows.delete`: Remove. Deleting a workflow also ends enrollments in progress, so it asks first.
- `workflows.logs`: execution logs and step statistics. "Ran this week" comes from here.

Confirm the endpoint shapes in the current docs before you build the editor. "Send me a test" texts `business_phone_number` with `conversations/message.write`.

## 8. Every page

Layout for all pages: one column up to 1023px wide (phone), a side menu from 1024px (computer). Phone tab bar: Today, Pipeline, Inbox, Calendar and More, plus a round Search button. More opens a bottom sheet with Leads, Quotes, Invoices, Payments due, Automations, Settings, Send feedback and Sign out. Every page links to every other page.

Thumb-first phone rules (the owner works one-handed):
- Every main action sits in the bottom third of the screen. The top bar holds no buttons.
- A page action bar sits right above the tab bar: "Next: Call · Maria Alvarez" on Today, Add a lead on Leads, week arrows plus Today, Estimate and Job on Calendar, stage arrows on Pipeline, New automation on Automations.
- Detail screens hide the tab bar and stick their main button to the bottom: a conversation, a quote, an invoice, the automation editor, a Settings section.
- Add a lead, Add a stop, pop-ups and the More menu open as bottom sheets with a grabber. Swipe down closes them like Cancel.
- The search field sits at the bottom, right above the keyboard. Follow the keyboard with the visual viewport API.
- Swipe from the left edge to go back. Swipe the stage list to change stage, the day strip to change week.
- On phones under 360px wide, Search moves to the top of the More sheet so the five tabs keep their room.

**Sign in.** Email and password (section 4.6). The client's logo, business name, keyword and city from custom values sit on top. Email field, password field, "Keep me signed in" and the "Sign in" button sit at the bottom of the phone screen, with "Forgot password" under it. Background from `business_main_background_video_or_image` on a computer. Face or fingerprint stays "Not available yet". Signing in opens Today. The design's "Continue with GoHighLevel" button and account step are replaced by this form. Inside GoHighLevel the user skips this screen (section 4.5).

**Today.** Greeting with the owner's first name and the count of things that need him ("Morning, Mike. 6 things need you today."). Four number tiles: New leads, Appointments, Jobs this week, Invoices to send. Each tile opens its page. "Needs you" lists the owner's to-dos sorted by urgency, with filters All, Leads, Quotes, Jobs. Each row has one button that does the job (Call, Reply, Approve, Visit done or No-show, Yes send invoice or Yes paid). The row then says what the system does next, with Undo. The top open row carries the one filled button. Also: today's calendar, new leads today or this week, money cards.

**Inbox.** Every conversation from every channel. Each row shows the channel in its own color plus the word. People who wait sit on top with a chip: amber under 1 hour, light red 1 hour or more, full red 24 hours or more. A segmented control filters All / Under 1 Hr / 1–24 Hrs / 24+ Hrs with counts. A summary line says who waits longest, with a "Reply to X" button. Open a conversation to read the thread. Quick replies (Call in 10 min, Booking link, Thanks) fill the box first, so the owner can still edit. Send adds the message and clears the wait. "Mark done" clears a conversation that needs no answer. "Flag for reply" puts it back. Under your last message: "Delivered" (text) or "Seen" (Facebook, Instagram), from the provider. The backend sends minutes waiting, never a ready-made label.

**Calendar.** Estimates (visits) and jobs by week or by day. One line says which calendar it syncs with (no API found yet for the name of the synced calendar: show "Not available yet" until confirmed). Past stops are gray. Press a stop to see the customer, address, status, Directions, Call, Text, Reschedule and Delete (asks first, with Undo). Drag a stop to move it (computer). Double-click a free time to add an estimate there (computer). Add estimate and Add job pick from free times. The now line and its time show in red. Any week opens. Online booking: a customer who accepted a quote gets `{business_website_url}/book`, picks a job date, and the card moves to Job Scheduled.

**Pipeline.** The 11 stages in 4 groups: Sales (New Lead to Quote Sent), Delivery (Job to Schedule to Job Done), Money (Payment Due), Later (Check Back Later, Lost). Computer: group tabs plus stage columns. Phone: a list of stages, tap one to see its cards, arrows and "Next stage" to move on. Each card shows what matters at its stage (section 7). A moved card lands on top of its new stage with a ring. Its old place shows where it went, what the system does next, Show and Undo.

**Leads.** Every new lead and where it came from. Number tiles: New today, This week, Wait on you. The same segmented control and summary as the Inbox. Leads that wait sit on top. The first waiting lead carries the one filled button. A lead that texted gets Reply (opens the Inbox) in place of Call. Book visit, Undo booking. "Add a lead by hand" takes name, phone, email and full address; it posts to the same form webhook as the website so the lead capture workflow runs. A panel shows where this week's leads came from. "42 leads with no contact in 3 months" offers one check-in text (asks first) and "Make it automatic".

**Quotes.** Number tiles and filters (All, To approve, Sent). A quote starts as "needs service and price". The owner types a service and a price or range, and the AI builds the quote. Or he uploads his own quote file. A sheet shows the quote as the customer gets it, with business details from custom values. Edit turns the sheet into a few fields. "Approve and send" opens the 20-second send timer. Then Accepted or Lost (reason sheet). Computer: the sheet sits next to the list. Phone: the sheet takes the whole screen and carries the one send button.

**Invoices.** Created when a job is marked done. A draft that misses one thing (price, address or name) shows that one field. The sheet shows a due term (7 days, placeholder) and a thank-you. "Send invoice" opens the send timer. Mark paid.

**Payments due.** Who owes money and how late: amber not due yet, light red late, full red more than 7 days late. A line on top says if online payments are connected (no API found yet: show "Not available yet" until confirmed). If not, "Connect in Settings" opens Settings on Connections. Each row: Call, Remind now, Mark paid, with Undo and the reminder history.

**Automations.** Section 7. Each row has an on/off switch that works at once. Edit opens four numbered steps: when, how soon, the text, when it stops. "Send me a test" texts the business phone first. New automation. Remove asks once, with Undo. Phone: the editor takes the whole screen with Back.

**Settings.** One section at a time: a sidebar on a computer, a list on a phone. Search finds any field or row. Sections:
1. Business details: the folder 01 custom values, each under its key.
2. Brand colors: 14 swatches; their fields sit behind one button. Save checks every color and the contrast rule.
3. Connections: business phone number, calendar, Facebook page, Instagram, Google My Business, online payments. Each row says Connected or Not connected where an API gives the status (section 6). No API was found to start a connection from this app. Until that is confirmed, a row that is not connected shows what you need, numbered steps, a "done when" line and a "Ask Forge Forward to connect" button that posts a request (same channel as Send feedback).
4. Your choices: switches that work at once (Approve every quote before it goes out, Customers pick their own job date).
5. Not available yet: Ask a deposit when a quote is accepted, Share your live location on job days, Sign in with your face or fingerprint.

A bad value opens the section that holds it and puts the cursor in that field.

**Shared pieces.** One search (customers, cards, quotes, invoices, payments, messages; grouped results; scope bar; recent searches). The send timer sheet. The reason sheet. Send feedback (posts the note to Forge Forward).

## 9. Every BACKEND note in the file

- Every call goes through the Forge Forward backend, never from the browser to GoHighLevel. One client never reaches another client's data.
- Sign in: email and password, or the signed user context inside GoHighLevel (section 4). The file's "Continue with GoHighLevel" note is replaced.
- Custom values: GET by key at sign-in. PUT one value on Save in Settings (values only, never keys).
- Today: GET to-dos by urgency (lead, quote, job), the four tiles, today's calendar, leads today and this week, money cards.
- Inbox: GET conversations (channel, minutes waiting, needs reply). GET messages of one conversation. POST a reply on the same channel. POST mark done or flag for reply. Sort waits from minutes: under 60, 60 to 1439, 1440 and more.
- Calendar: GET stops (estimate or job, start, length, customer, address, reminder status) for any week. POST a stop. PATCH on drag or Reschedule and text the customer. DELETE with Undo in the session. Two-way sync with the connected calendar. Online booking posts a job stop, moves the card to Job Scheduled, alerts the owner and sends the confirmation.
- Pipeline: GET cards per stage with tags. POST move to Lost with a reason or to Check Back Later, with Undo. POST move to Job Done, with Undo.
- Leads: GET leads with source and minutes waiting, plus counts per source. POST add lead to `0_webhook_url_form`. POST call, reply, book visit, undo booking. POST check-in text to leads with no contact in 3 months (asks first). "Make it automatic" creates a workflow (`workflows.write`).
- Quotes: GET quotes (lines, total, status, opened count). POST service and price, the AI builds it. POST an uploaded quote file. POST send, held 20 seconds. POST lost with a reason.
- Invoices: GET invoices (status, days late). PATCH the missing field. POST send, held 20 seconds. POST mark paid.
- Payments due: GET open invoices by lateness and reminder history. POST remind now, POST mark paid, Undo. Payment processor status (not available yet).
- Automations: GET workflows per folder. POST on/off (publish or draft), PATCH edit, POST new, DELETE (asks first, Undo), POST send me a test.
- Settings: custom values; connection status where an API gives it; two switches.
- Search: the real search asks the backend, so it finds every contact, quote and invoice of the sub-account.
- Refresh: pull to refresh and the refresh every 60 seconds ask for new leads, messages and payments.
- Delivered comes from the text provider's delivery report. Seen comes from Facebook and Instagram read receipts. Email shows neither.

## 10. Design system (keep it exactly)

The design follows Apple's Human Interface Guidelines at iPhone scale on every screen size.

| Token | Value |
|---|---|
| Font | System font stack (SF Pro on Apple devices). No web font. |
| Text styles | Apple iOS styles: Large Title 34/41, Title 1 28/34, Title 2 22/28, Title 3 20/25, Headline 17/22 semibold, Body 17/22, Callout 16/21, Subheadline 15/20, Footnote 13/18. Use Apple's tracking per size. Smallest text 13. |
| Spacing | 4, 8, 12, 16, 24, 32 px. Phone side margin 16, computer 36. |
| Hit area | 44 x 44 pt for every control (a smaller box may grow its hit area with a pseudo element). |
| Contrast | 4.5 to 1 for text, 3 to 1 for large and bold text. |
| Layout switch | 1023px and down is the phone layout. |
| Reflow | Works from 320 to 1920 px wide with no sideways scroll. |
| Motion | press 100ms, small 180ms, mid 220ms, panel 260ms, exit 180ms. Nothing over 400ms. Stop all motion with reduce motion. Make glass solid with reduce transparency. |

Color meaning, always with an icon or a word too: main = press, open, finished. Amber (highlight) = waiting, with a clock. Red (error) = late or unread. Navy (sub) = a job. Channel colors are fixed in one place (not custom values): Call green, Text blue, Web form purple, Facebook indigo, Instagram burnt orange, Google My Business teal, Email navy.

Patterns to keep:
- One filled button per view at most. Status is a chip with a word and an icon.
- Labels sit above fields. An error sits under its field, says what is wrong and moves the cursor there.
- Undo sits next to the change. A step that can not be undone asks first.
- Switches work at once and show On or Off. Keep them out of forms that need Save.
- Phone: one thing per screen. Editors take the whole screen with Back.
- Phone: swipe a row right to run its main button, left to mark it done or paid. The buttons stay on the row.
- Long-press or right-click a row, card or stop for a menu of its buttons. Destructive ones sit last in red.
- Pop-ups are bottom sheets on a phone with a grabber. Swipe down closes them like Cancel.
- The page title moves into the top bar as you scroll (phone). The top bar turns to glass once content scrolls under it.
- The phone tab bar floats as a glass capsule and steps aside in a conversation.
- Pull to refresh on phone lists.
- Keyboard on a computer: Cmd/Ctrl-F search, Cmd/Ctrl-Z undo, Cmd/Ctrl-, settings, Option-Cmd-N new lead, arrows between rows, Esc closes, Cmd/Ctrl-? lists the shortcuts.
- Empty states say what is going on and offer one way out ("Show all", "Add estimate").

Layout at every width (these broke once, so test them):
- Two columns (a list with a side panel) drop to one column from 1024 to 1199px wide. On Quotes and Invoices, See the quote and View then scroll to the sheet.
- Every list checks its own width with a container query. Below 700px the row buttons move under the name.
- Number tiles use `repeat(auto-fit, minmax(min(100%, 9.5rem), 1fr))` and keep each number on one line.
- Pipeline columns keep at least 208px. When they do not fit, the board scrolls sideways inside itself (scroll snap). Card rows grow with their text; never fix their height.
- Words break between words, never between letters (`overflow-wrap: break-word`, never `anywhere` on names).
- Settings uses a 240px sidebar from 1280px and 200px from 1024 to 1279px. Business details go one per row when their panel is under 860px.
- Today stacks its two cards and shows the four tiles two by two from 1024 to 1199px.
- Test every page at 320, 360, 390, 430, 768, 1024, 1050, 1100, 1180, 1280, 1366, 1440, 1680 and 1920 wide. Fail on any word that does not fit its box, any overlap, any wrapped number, any clipped card and any cut-off name.

Writing in the app: short words, present tense, active voice, 20 words or fewer per sentence, no em dashes.

## 11. Next.js conversion notes

1. **Stack and routes.** Next.js App Router with TypeScript. One route per page: `/today`, `/inbox`, `/inbox/[conversationId]`, `/calendar`, `/pipeline`, `/leads`, `/quotes`, `/invoices`, `/payments`, `/automations`, `/settings/[section]`, plus `/sign-in`, `/forgot-password`, `/invite/[token]`, `/embed` and `/admin/clients`. API: `/api/integrations/oauth/start`, `/api/integrations/oauth/callback`, `/api/integrations/webhooks`. A shared layout holds the side menu, the phone top bar and the tab bar.
2. **Server is the backend.** Route handlers and server actions call GoHighLevel. Keep the HighLevel client in `server-only` modules. Env vars are in section 15.
3. **Tenancy.** Resolve the tenant and `locationId` from the session on every request. Never take it from the browser. Add it to every cache key and database row.
4. **Tokens.** Section 4.8.
5. **Rate limits.** 100 requests per 10 seconds and 200,000 per day, counted per app per sub-account. Read the `X-RateLimit-*` headers. Batch reads, cache them, and back off on 429 and 5xx.
6. **Brand at first paint.** Read custom values in the root layout (server component). Print them as CSS variables on `<html>` or the app root. Cache per tenant and revalidate when Settings saves or a `LocationUpdate` webhook arrives.
7. **Styles.** Port the CSS from the file with its tokens. CSS Modules or one global sheet both work. Keep the class names while you port, so you can compare against the file side by side. Keep the `@media (max-width: 1023px)` split.
8. **State.** The file keeps each page's state in a small class (for example `P_inbox` with `need`, `sel`, `open`, `flt`, `sent`). Map each to React state plus server data (TanStack Query or SWR). Use optimistic updates with Undo, then confirm with the server.
9. **Live data.** Section 4.4. Push to open screens with server-sent events. Fall back to a 60-second refetch.
10. **Send timer.** Run it on the server: queue the send with a 20-second delay and a cancel endpoint. The browser only shows the countdown.
11. **Delete and Undo.** Soft-delete for the Undo window, then commit.
12. **Forms.** Use server actions with field-level errors that match the file's copy.
13. **Accessibility.** Keep every role, label, focus move and keyboard shortcut from the file. Segmented controls are radio groups with arrow keys. Menus use role menu. Sheets trap focus and close on Esc.
14. **Phone app feel.** Add a web app manifest and icons from `business_favicon_url` or the logo, so the owner can add it to his home screen. Respect safe areas with `env(safe-area-inset-*)`.
15. **Fake parts to replace.** Sample data, the GoHighLevel account step (now the email and password form), Delivered/Seen, search over page rows, the pull-to-refresh timestamp, the AI quote builder (needs a real model call on the server), and the "Not available yet" items.
16. **Tests.** Playwright checks per page at the 14 widths in section 10: no sideways scroll, no squeezed words, no overlaps, 44 pt targets, text styles, every menu link, and each page doing what its line says. Thumb checks on a 390 x 844 phone: every main action's center sits below 563px. Unit tests: refresh lock, re-mint path, webhook signature and idempotency, user-context decrypt. Tenancy test: a user of tenant A asks for tenant B data and gets 403 or 404.
17. **Container queries.** Use them for lists, panels and the segmented control. Never put `container-type` on `.fd-main` or a page wrapper, because it turns fixed sheets into absolute ones.

**Done when (first milestone):**
- On staging, the Test app installs on a test sub-account and the tenant shows Connected in `/admin/clients`.
- An invited owner logs in on the phone and sees that sub-account's real contacts, colors and logo.
- The "CRM" page inside GoHighLevel opens with no second login.
- The tenancy test passes.

## 12. Open questions to settle first

- Does Save in Settings write back to GoHighLevel? It changes the website too.
- Which email sender handles invites and password resets (for example Resend)?
- Which AI model and key power the quote builder?
- What happens when a text fails to send (error and escalation)?
- Invoice terms: 7 days is a placeholder.
- "Ask a deposit": confirm what the system supports.
- No API found for: the A2P status and 4 Trust Center checks, payment processor status, the name of the synced calendar, starting a connection from this app. Confirm with HighLevel support or keep "Not available yet".
- A Customers page with job history is not designed yet.

Settled on 20 Nov 2026: the phone sign-in route (email and password) and whether the API can edit workflows (it can).

## 13. Sources for the GoHighLevel parts

- OAuth 2.0: https://marketplace.gohighlevel.com/docs/Authorization/OAuth2.0/
- Agency install flow (Target User: Sub-Account): https://marketplace.gohighlevel.com/docs/Authorization/TargetUserSubAccount/
- Location token from agency token: https://marketplace.gohighlevel.com/docs/ghl/oauth/get-location-access-token/
- Distribution types and auto-install: https://help.gohighlevel.com/support/solutions/articles/155000002141-marketplace-app-distribution-type
- Rate limits: https://marketplace.gohighlevel.com/docs/other/rate-limits
- Webhook signatures: https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide
- App uninstall webhook: https://marketplace.gohighlevel.com/docs/webhook/AppUninstall
- User context (SSO): https://marketplace.gohighlevel.com/docs/other/user-context-marketplace-apps/
- Custom Pages: https://marketplace.gohighlevel.com/docs/marketplace-modules/CustomPages/
- OpportunityStageUpdate webhook: https://marketplace.gohighlevel.com/docs/webhook/OpportunityStageUpdate.md
- Workflow trigger "Pipeline Stage Changed": https://help.gohighlevel.com/support/solutions/articles/155000002493-workflow-trigger-pipeline-stage-changed
- API index: https://marketplace.gohighlevel.com/docs/llms.txt

## 14. HighLevel app settings (set up 20 Nov 2026)

| Setting | Live app | Test app |
|---|---|---|
| Name | Forge Forward CRM | Forge Forward CRM Test |
| App ID | `6b00d325c5c41e953d446ffd` | `6b00d1e02f048e0d81d2f48a` |
| Used by | production (`crm.forgeforward.io`) | staging (`staging.crm.forgeforward.io`) and dev (`dev.crm.forgeforward.io`) |
| Type | Private (goes live with no review; up to 5 agencies) | Private |
| Target user | Sub-account | Sub-account |
| Who can install | Agency only | Agency only |
| Listing | White-label | White-label |
| Redirect URLs | `https://crm.forgeforward.io/api/integrations/oauth/callback` | `https://staging.crm.forgeforward.io/api/integrations/oauth/callback`, `https://dev.crm.forgeforward.io/api/integrations/oauth/callback` |
| Webhook URL | `https://crm.forgeforward.io/api/integrations/webhooks` | `https://staging.crm.forgeforward.io/api/integrations/webhooks` |
| Custom Page | "CRM", sub-account left menu, `https://crm.forgeforward.io/embed` | "CRM", sub-account left menu, `https://staging.crm.forgeforward.io/embed` (testing URL: dev) |
| Scopes | 37 (below) | same 37 |
| Webhook events | 26 (section 6) | same 26 |

Dev shares the Test app, but webhooks only reach staging. Dev and staging must never install with the same token at the same time.

Scopes (both apps): `oauth.readonly`, `oauth.write`, `locations.readonly`, `locations/customValues.readonly`, `locations/customValues.write`, `locations/tags.readonly`, `locations/customFields.readonly`, `users.readonly`, `contacts.readonly`, `contacts.write`, `opportunities.readonly`, `opportunities.write`, `pipelines.readonly`, `calendars.readonly`, `calendars.write`, `calendars/events.readonly`, `calendars/events.write`, `calendars/groups.readonly`, `calendars/groups.write`, `calendars/resources.readonly`, `calendars/resources.write`, `conversations.readonly`, `conversations.write`, `conversations/message.readonly`, `conversations/message.write`, `invoices.readonly`, `invoices.write`, `invoices/estimate.readonly`, `invoices/estimate.write`, `payments/transactions.readonly`, `workflows.readonly`, `workflows.write`, `workflows.delete`, `workflows.publish`, `workflows.logs`, `phonenumbers.read`, `socialplanner/account.readonly`.

Adding a scope later needs a new app version. Installed accounts must approve the new scope.

## 15. Environment variables (Vercel)

Matt pastes the secrets into Vercel himself. Never commit them and never ask for them in chat.

| Name | Production | Staging | Dev | Where it comes from |
|---|---|---|---|---|
| `GHL_APP_ID` | `6b00d325c5c41e953d446ffd` | `6b00d1e02f048e0d81d2f48a` | `6b00d1e02f048e0d81d2f48a` | Section 14 |
| `GHL_CLIENT_ID` | live app | Test app | Test app | Marketplace > the app > Manage > Secrets > Client keys > Add |
| `GHL_CLIENT_SECRET` | live app | Test app | Test app | Same place. Shown once. |
| `GHL_APP_SHARED_SECRET` | live app | Test app | Test app | Manage > Secrets > Shared secret > Generate key |
| `GHL_REDIRECT_URI` | `https://crm.forgeforward.io/api/integrations/oauth/callback` | `https://staging.crm.forgeforward.io/api/integrations/oauth/callback` | `https://dev.crm.forgeforward.io/api/integrations/oauth/callback` | Section 14 |
| `GHL_API_BASE_URL` | `https://services.leadconnectorhq.com` | same | same | HighLevel docs |
| `GHL_INSTALL_BASE_URL` | `https://marketplace.gohighlevel.com` | same | same | HighLevel docs |
| `APP_URL` and `BETTER_AUTH_URL` | `https://crm.forgeforward.io` | `https://staging.crm.forgeforward.io` | `https://dev.crm.forgeforward.io` | Your domains |
| `BETTER_AUTH_SECRET` | its own value | its own value | its own value | `openssl rand -base64 32` |
| `TOKEN_ENCRYPTION_KEY` | its own value | its own value | its own value | `openssl rand -base64 32` (32 bytes for AES-256-GCM) |
| `DATABASE_URL` | Neon main branch | Neon staging branch | Neon dev branch | Neon |
| Email sender key | decide (section 12) | | | |
| AI model key | decide (section 12) | | | |

Vercel Deployment Protection must not block `staging.crm.forgeforward.io` or `dev.crm.forgeforward.io`, or HighLevel's webhooks and the GoHighLevel page can not reach them.
