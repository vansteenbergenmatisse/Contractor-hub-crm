### STEP 4: Give them access to the CRM

> Source: Matt's SOP file `SOP-Step-4-Add-Client-To-CRM (1).md` (24 Nov 2026, 09:50), copied into the repo on 24 Nov 2026 (late) and updated with that evening's findings. The technical version for Forge Forward dev is `docs/sop-highlevel-install.md`; when the two disagree, that file wins and this one gets fixed.

<aside>
⏱️

When: right after Steps 1–3 (sub-account created from the snapshot, details filled in, card added)

</aside>

The client uses **one login: their HighLevel login.** They never get a separate CRM password unless they ask for one.

<aside>
⚠️

Status (24 Nov 2026): everything below is built and live on the **dev** site (`dev.crm.forgeforward.io`). Staging and production do not have it yet.

**Proven on dev on 24 Nov 2026** with a throwaway sub-account made from snapshot "Forge Forward – Landscaping Core v2.0": A1, A2, and Part B Steps 1 and 2 (the new sub-account connected by itself in under a minute).

**Also proven on dev on 24 Nov 2026:** a sub-account **Admin** of the new sub-account signed in with **Sign in with HighLevel** on a laptop and landed on **Today** as Owner. An admin save of a custom value on that sub-account reached HighLevel.

**Not proven yet:** the phone, staying signed in over days, the "Open on my phone or laptop" link, image uploads, **Copy from template**. Steps marked *(not proven)* may still change.

</aside>

---

### PART A: ONE-TIME SETUP (Forge Forward, once per environment, NOT per client)

Do this once for dev, and later once for production. After that, every new client only needs Part B.

**Before you start:** the environment must run the newest CRM code (dev does; staging and production get it when Forge Forward dev promotes it). Check that `https://<crm-site>/sign-in` shows a **Sign in with HighLevel** button. If it doesn't, stop and tell Forge Forward dev.

#### **A1. Switch on the app's webhooks**

1. HighLevel developer portal → our CRM app → **Advanced Settings** → **Webhooks**.
2. Webhook URL: `https://<crm-site>/api/integrations/webhooks`
3. Switch on: **LocationCreate**, **LocationUpdate**, **UserCreate**, **UserUpdate**, **UserDelete**. Click **Save** at the bottom.
4. **INSTALL** and **UNINSTALL** have no switch in the list. HighLevel sends them anyway (proven on dev, 24 Nov 2026).

#### **A2. Install the app on all sub-accounts, including future ones**

1. Sign in to the CRM as a Forge Forward admin (`https://<crm-site>/sign-in`).
2. In the **same browser**, open `https://<crm-site>/api/integrations/oauth/start` (the link works for 10 minutes).
3. Log in to HighLevel if it asks (you type the password yourself) and click **Install**.
4. Tick **Select all sub-accounts**. Leave **Auto-install on future sub-accounts** switched on. Click **Continue**, then **Allow & install**.
5. First install: you land on a plain page like `{"installed":3,"failed":0}`. That means it worked.
6. App already installed somewhere (HighLevel shows **Install to more sub-accounts**): HighLevel stays on its own app page after you approve. That is normal. The new sub-accounts still connect, because HighLevel sends an INSTALL event for each one (proven on dev, 24 Nov 2026).
7. Open `https://<crm-site>/admin/clients` and check each client says **Connected**. Give it one minute.

⚠️ <u>***NEVER install the app from HighLevel's Marketplace page.***</u> The CRM does not accept that install. Always use the link above.

⚠️ "Select all" creates a CRM client and CRM accounts for every sub-account in the agency. Nobody gets an email from this, and nothing changes in HighLevel. (Decided for dev on 24 Nov 2026; production will do the same.)

#### **A3. Point the CRM menu item at the sign-in page**

The **CRM** item in the left menu is our app's own **Custom Page**. Every sub-account that has the app gets it by itself, new sub-accounts too (proven on dev, 24 Nov 2026). You do not add anything per client.

⚠️ <u>***Do NOT use an agency Custom Menu Link for this.***</u> We tried it on dev on 24 Nov 2026. It showed "Signing you in…" and then "HighLevel did not answer", because HighLevel does not tell a custom menu link who is logged in. It also does not appear on new sub-accounts by itself.

1. HighLevel developer portal → our CRM app → **Modules** → **Custom Pages** → open the page called **CRM**.
2. Set its URL to `https://<crm-site>/embed` (dev: `https://dev.crm.forgeforward.io/embed`). Nothing else in the URL.
3. Keep: placement **Left menu navigation**, visible on **Sub-account**.
4. Save.
5. Open any client sub-account on `app.forgeforward.io` and click **CRM**. It should say "Signing you in…" and then sign you in.

Before step 2, ask Forge Forward dev to confirm two things:
- The CRM allows `app.forgeforward.io` to show it inside HighLevel. Without that, the CRM page stays blank for clients.
- No real client can change live data through that environment. On dev, JCR has the app too, so JCR's **CRM** item will open the dev CRM.

*(not proven)* Whether the URL change reaches sub-accounts that already have the app without publishing a new app version. *(not proven)* Whether the Custom Page signs the person in. Until step 2 is done, the **CRM** item shows the old "Install your app" guide.

#### **A4. Tell the CRM where that menu page lives**

1. Open any client sub-account on `app.forgeforward.io` and click **CRM** in the left menu.
2. Copy the full address from the address bar. It looks like `https://app.forgeforward.io/v2/location/AbC123.../custom-page-link/XyZ...`
3. Replace the sub-account's id (the part right after `/location/`) with `{locationId}`.
4. Send that line to Forge Forward dev. They set it in Vercel as `HIGHLEVEL_CRM_MENU_URL` for that environment and redeploy.

For dev (the test app) the line is:
`https://app.forgeforward.io/v2/location/{locationId}/custom-page-link/6b00d9f9ce0bbccaaf27ffd2`

The last part is the same in every sub-account (checked on three, 24 Nov 2026). The production app has its own id, so copy it again for production. Always use `app.forgeforward.io`, because that is where clients log in.

Dev: set in Vercel (Preview `develop`) on 24 Nov 2026. Production: still to do.

Without this, **Sign in with HighLevel** still works, but it opens HighLevel's home page and the owner has to open their business and click **CRM** themselves.

---

### PART B: EVERY NEW CLIENT

#### **Step 1: Check the CRM picked up the sub-account**

1. Sign in to the CRM as a Forge Forward admin → **Clients** (`/admin/clients`).
2. A new sub-account connects by itself within about a minute of being created (proven on dev, 24 Nov 2026). The snapshot does not need to carry the app.
3. Opening this page also checks HighLevel for new sub-accounts (at most once every 5 minutes).
4. Find the client. **Status** must say **Connected**. Users shows 0 until you add staff in Step 4.
5. Not in the list? Click **Check for new sub-accounts**, wait for it to finish, then reload the page.
6. Still not there? The app is not installed on that sub-account. Redo **A2** and make sure it is included.

#### **Step 2: Check their data shows up**

1. On **Clients**, click **View client** next to the new client. This opens the CRM as them, read-only, for 1 hour.
2. Check **Leads**, **Pipeline** and **Calendar** show **their** data (not JCR's).
3. Check the name, logo and colors are theirs. If you see the snapshot's values, fix the custom values (Step 3).
4. Leads called "(Example) ..." are HighLevel's own sample contacts. They show up when "Include sample data" was on while creating the sub-account. Delete them in HighLevel.
5. A brand-new sub-account has **every custom value blank** (a snapshot copies the names and folders, not the values). **Settings** then shows empty fields ready to fill, and no phone number is a normal state (fixed 24 Nov 2026). If Settings says "Your details did not load", tell Forge Forward dev.

#### **Step 3: Fill in the custom values**

**First, copy the template values (once per client):** CRM → **Clients** → **Copy from template** on the new client's row → check the preview → **Apply**. It fills every **blank** value from the template sub-account (JCR today), images included (re-uploaded into the new sub-account). It never overwrites a value that is already filled. The row says "still template values" until you replace the client's own details. *(not proven live yet)*

**Then replace them with the client's own values**, in HighLevel (sub-account → **Settings** → **Custom Values**) or in the CRM (**Clients** → **Edit values** on the client's row). Use the client's TXT file in Google Drive.

- **01_Business_essentials:** business name, owner name, phone number, email, address, city, state, main county, business hours (24-hour, for example 07:00 to 17:00, for weekdays, Saturday and Sunday), logo link, favicon link, universal CTA, main background image (an image, not a video)
- **01b_Google_Business_Profile:** Google profile link, Google review request link
- **01c_booking_links:** request a job booking link, request a quote booking link
- **02_Branding:** the 14 colors as hex codes (for example #1F5130)

⚠️ <u>***Replace EVERY value that came from the snapshot.***</u> Otherwise the client sees another client's name, colors or logo.

⚠️ The main color must be readable against "text on main color". If not, the CRM uses the default green.

⚠️ The snapshot also brings a left-menu item called **JCRlandscaping Account Files**. Rename it or remove it for the new client.

**Set, then lock:** in **Edit values**, lock the values the owner must not change. The owner then sees them read-only ("Ask Forge Forward to change this"). Secret-looking values (keys, tokens, webhook links) start locked and never reach the owner's screen.

#### **Step 4: Add the owner (and staff) in HighLevel**

1. Sub-account → **Settings** → **My Staff** (called **Team** in some HighLevel versions) → add the person.
2. The business owner: role **Admin**. This makes them **Owner** in the CRM.
3. Office staff: role **User**. This makes them **Office** in the CRM.
4. Use their real email. HighLevel sends its own invite email so they can set their HighLevel password.
5. Wait a few minutes. Then on **Clients**, click **Users** on the client's row and check they are listed (it shows "Never signed in" until they log in).

⚠️ <u>***Agency logins do not get in.***</u> Someone who opens the sub-account from the agency view sees "You are signed in with an agency login…". That is on purpose: each client's CRM is only for that business's own team. To look at a client yourself, use **View client** on **Clients**.

⚠️ <u>***One email = one CRM account across ALL clients.***</u> If the owner's email is already used at another client, they cannot get in. Use another email for them, or ask Forge Forward dev.

#### **Step 5: Send the owner their sign-in link**

1. On **Clients**, in the client's row, copy their link from the **Sign-in link** column (looks like `https://<crm-site>/sign-in?client=<their-name>`).
2. Send them this message:

> Hi [name], your CRM is ready.
> 1. First accept the HighLevel invite email and pick your password.
> 2. Then open this link on your phone AND on your laptop: [sign-in link]
> 3. Tap **Sign in with HighLevel**, log in with your HighLevel email and password if it asks, then tap **Continue**.
> That's it. You stay signed in on that phone and laptop from now on.
> On your phone: after signing in, tap Share → **Add to Home Screen** so the CRM opens like an app.
> You can also always open it from **CRM** in your HighLevel menu.

#### **Step 6: What the owner sees (so you can help them)**

1. They open their sign-in link and tap **Sign in with HighLevel** (email and password is only a second option below it).
2. HighLevel opens. They log in with their HighLevel email and password, only if HighLevel asks.
3. Their CRM page in HighLevel shows "Signing you in…".
4. The page jumps to the full-screen CRM, which asks them to tap **Continue**.
5. They land on **Today**, signed in. That device stays signed in for a year, and every use extends it.

*(not proven)* If the page does not jump by itself, they see three buttons: **Open full screen**, **Open in a new tab** and **Use it here, inside HighLevel**. Tell them to tap **Open full screen**.

If they see "This link has expired or was already used", they just start again from their sign-in link.

**If they get signed out** (after a year without use, or after **Sign out**): the sign-in page says "Sign in again with HighLevel. Use j•••@gmail.com." (the email they used last time, partly hidden) and the button goes straight to their CRM. Forgot the password? They reset it on the HighLevel login screen. Inside HighLevel, a lost sign-in shows "Your sign-in ended." with **Sign in again**.

**Messages when someone cannot get in** (each has **Try again**): "agency login" → use a user of that sub-account; "not part of this business yet" → add them under My Staff; "turned off for this business" → **Turn on login** on **Clients**; "not connected to the CRM yet" → redo A2; "Your access to this CRM is turned off" → turn the user back on under **Users**; "your email is already linked to another CRM" → ask Forge Forward dev.

<u>***Another device without logging in again:***</u> in the CRM side menu, tap **Open on my phone or laptop** → **Copy link** → open that link on the other device within 5 minutes → tap **Continue**. The link works once. (No QR code yet.)

#### **Step 7: Check their HighLevel setup matches what the CRM expects**

- **Phone number:** Settings → Phone Numbers. They have a number and A2P is approved. The CRM cannot read A2P status itself, so note the date you confirmed it.
- **Calendars:** for the "On my way" text later, calendars must be named exactly one of: `Job`, `Jobs`, `Estimate`, `Estimates`, `Schedule a Job`, `Request an Estimate`.
- **Pipeline:** the snapshot's pipeline is there with the right stages.

#### **Step 8: Leave the other "write" switches OFF**

Settings saving back to HighLevel is planned to be **on for every client** in production (decided 24 Nov 2026); on dev it is on per client only. Do not ask to turn on the others for a new client: image upload, new lead saving to HighLevel, "On my way" texts. Forge Forward dev turns them on per client, after testing, using the client id from **Copy id** on the Clients page.

#### **Step 9: Final check with the owner**

1. The owner is signed in on their phone **and** laptop.
2. They see their own name, logo and colors.
3. They see their own leads, pipeline and calendar.
4. On **Clients** → **Users**, the owner now shows "Has signed in".
5. Note in the client's Google Drive TXT file: "Added to CRM on <date>, owner signed in on phone and laptop".

#### **Step 10: Connect their email and calendar in HighLevel**

The CRM's **Inbox** and **Calendar** show what HighLevel has. If their email or calendar is not connected in HighLevel, those pages stay empty.

1. With the owner (or with their login details), connect their business email in the sub-account (HighLevel's email / conversations settings).
2. Connect their Google or Outlook calendar to the snapshot's calendars, if they use one.
3. Check in the CRM: **Inbox** shows their conversations and **Calendar** shows their appointments.

The CRM cannot see whether email is connected, so it shows a "check that your mailbox is connected" reminder until the owner closes it.

#### OPTIONAL (later): CRM email and password

Only if an owner wants to sign in without HighLevel.

- On **Clients** → **Users** → **Send sign-in email**. The page always shows the link with **Copy link**, and says honestly if the email was not sent. The link works for 24 hours, and only the newest one works.
- Right now emails only go out on dev, and only to Forge Forward's own test address. For real clients, Forge Forward dev must first switch on email for production (Resend with our own domain).
- Someone who already signed in once uses **Forgot password** on the sign-in page instead.

---

#### CHECKLIST (STEP 4)

**0. One-time setup (only the first time per environment)**

- [ ]  Webhooks switched on in the app (A1).
- [ ]  App installed with **Select all**, from our link, not the Marketplace (A2).
- [ ]  The app's **CRM** Custom Page points at `/embed`, and it signs you in (A3). No agency Custom Menu Link.
- [ ]  Menu page address (`.../custom-page-link/...` on `app.forgeforward.io`) sent to dev and set in Vercel (A4).

**1. Connected**

- [ ]  The client shows **Connected** on CRM → **Clients** (used **Check for new sub-accounts** if needed).

**2. Their data shows**

- [ ]  With **View client**, you saw their own leads, pipeline, calendar, name, logo and colors.

**3. Custom values**

- [ ]  **Copy from template** applied (blank values filled from JCR).
- [ ]  01_Business_essentials, 01b_Google_Business_Profile, 01c_booking_links and 02_Branding replaced from the TXT file.
- [ ]  Values the owner must not change are locked (**Edit values**).
- [ ]  No snapshot values left, and the "JCRlandscaping Account Files" menu item renamed or removed.

**4. Users**

- [ ]  Owner added in HighLevel as **Admin**, staff as **User**, real emails.
- [ ]  They show under **Users** on the client's row.
- [ ]  The owner's email is not used at another client.

**5. Owner access**

- [ ]  Owner accepted the HighLevel invite.
- [ ]  Sign-in link and message sent.
- [ ]  Owner signed in with **Sign in with HighLevel** on phone and laptop.
- [ ]  CRM added to their phone's home screen.

**6. HighLevel setup**

- [ ]  Phone number and A2P confirmed (date noted).
- [ ]  Calendar names and pipeline checked.
- [ ]  Their email and calendar are connected in HighLevel, and Inbox and Calendar show data.

**7. Safety**

- [ ]  No write switches turned on.
- [ ]  No test messages sent to the client's real customers.

**8. Done**

- [ ]  Owner shows "Has signed in" under **Users**.
- [ ]  "Added to CRM" with the date noted in their Google Drive TXT file.

---

#### NOT BUILT YET (do by hand or skip for now)

- **CRM subscription ($397/month):** billing through Stripe is planned but not built. Until then, bill the client the way you do today.
- **QR code** for "Open on my phone or laptop": copy the link instead.
- **Quotes with AI, sending quotes and invoices, moving cards in Pipeline:** being built (Waves 2–4). The pages show "Not available yet" where something is not ready.
- **Facebook, Instagram, Google Business Profile** in CRM Settings → Connections: shown as not connected; connect them in HighLevel itself.
