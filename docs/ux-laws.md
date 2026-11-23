# UX laws in this CRM

Applied 2026-11-22 at the user's request. One agent per law read the source and audited the code. A merge agent verified the findings, then builders applied them. This is the reference for new screens: apply the same rules when Inbox, Pipeline, Quotes, Invoices, Payments, Calendar and Automations are wired.

The user dictated some names; they were read as: "static usability" = aesthetic-usability, "prognostics" = Prägnanz, "Acom's razor" = Occam's razor, "uniform correctedness" = uniform connectedness, "common laws" = Fitts, Hick, Jakob, Miller and Doherty.

## House rules that came out of it

- Never show sample data, a fake status or a success that did not happen. A control that cannot work yet is disabled and says so.
- Put real work first on a phone: Today, Leads, Inbox and Calendar are the tabs; everything else is under More.
- Show errors next to the field or row they belong to, and make every finish (saved, failed, signed out) visible where the thumb just was.
- One look per role: one filled main action, plain secondary actions, one failure style.
- The app absorbs format work (adds `#` or `https://` where safe), and never prefills a value left over from another person.
- Keep brand tokens, 44pt targets, WCAG AA and a working 320px layout.

## Laws and principles

| Law | What it means here | Source |
|---|---|---|
| Aesthetic-Usability Effect | People judge a polished interface as easier to use and forgive its minor flaws, but polish does not fix major problems and can hide them, so this CRM should remove visual noise and broken-looking details on live screens without dressing up missing data or making anything look available when it is not. | https://lawsofux.com/aesthetic-usability-effect/ |
| Law of Proximity | Things placed near each other read as related, so on a phone each result or error must sit beside the control or field it belongs to, and the gap inside a group must be smaller than the gap between groups. | https://lawsofux.com/law-of-proximity/ |
| Von Restorff Effect | When similar items sit together, the one that differs is remembered, so the CRM should reserve its few distinct treatments for what a contractor must act on, use them sparingly, and never signal them by color or motion alone. | https://lawsofux.com/von-restorff-effect/ |
| Zeigarnik Effect | People remember interrupted tasks better than finished ones, so when a tradesperson is pulled away mid-entry the CRM should show truthfully what is still unfinished and make it easy to resume, without inventing progress or to-dos. | https://lawsofux.com/zeigarnik-effect/ |
| Tesler's Law (conservation of complexity) | Every task has complexity that cannot be removed, so the CRM should absorb its own HighLevel keys, data formats and save limits instead of making a busy contractor on a phone understand them. | https://lawsofux.com/teslers-law/ |
| Law of Prägnanz | People read a complex screen as its simplest form, so a contractor glancing at a phone should see one clear shape per idea: repeated "Not available yet" blocks should collapse into one, and the real data should stand out. | https://lawsofux.com/law-of-pr%C3%A4gnanz/ |
| Serial Position Effect | People best remember the first and last items in a series, so a contractor's key daily destinations and content belong at the ends of navigation and page sequences, with the least important items in the middle. | https://lawsofux.com/serial-position-effect/ |
| Progressive Disclosure | Keep what a contractor needs often on the first level and move rarely used options to one clearly labelled second level, because hiding frequent tasks or adding extra levels makes the app harder to use. | https://www.nngroup.com/articles/progressive-disclosure/ |
| Law of Common Region | Elements read as a group when they share an area with a clear boundary, such as a border or background, so each CRM card or row should contain exactly what belongs together, and no boundary should appear empty or hold controls from another subject. | https://lawsofux.com/law-of-common-region/ |
| Goal-Gradient Effect | People push harder as a goal gets closer, so the CRM should show the true distance to finishing in real multi-step flows and finite to-do lists, without inventing progress; live Today and Leads have no real completion data yet, so the law applies there only once to-dos are wired. | https://lawsofux.com/goal-gradient-effect/ |
| Law of Similarity | Controls that look alike are read as having the same meaning or function, so a contractor should be able to tell a row's main action, a secondary action and a form's submit button apart by their look, and each role should look the same on every screen. | https://lawsofux.com/law-of-similarity/ |
| Recognition Over Recall | A contractor between jobs should pick from visible, truthful options and cues (the working pages, a customer's street, why a button is off) instead of having to remember what works, where it lives, or how a customer was stored. | https://www.nngroup.com/articles/recognition-and-recall/ |
| Pareto Principle | Roughly 80% of effects come from 20% of causes, so this CRM should give its best phone space and shortest paths to the few things a contractor uses daily, which today means the real leads list, rather than spreading it evenly across screens that are not available yet. | https://lawsofux.com/pareto-principle/ |
| Occam's Razor | Among options that work equally well, keep the one with the fewest assumptions: for a tradesperson on a phone, remove any repeated status, internal term or dead control that can go without losing function or honesty. | https://lawsofux.com/occams-razor/ |
| Parkinson's Law | A task expands to fill the time allowed, so a contractor's short data-entry jobs should finish faster than expected by letting the phone keyboard and browser autofill do the work wherever the data is the user's own. | https://lawsofux.com/parkinsons-law/ |
| Law of Uniform Connectedness | Elements that share a visible connection, such as a frame, line or color, read as more related than unconnected ones, so a status that describes the lead list should share that list's frame; most live surfaces here already do this with cards, row dividers and panels. | https://lawsofux.com/law-of-uniform-connectedness/ |
| Paradox of the Active User | Contractors will not read instructions and will learn the CRM by tapping things mid-job, so each control, result and dead end must explain itself at that moment, wherever they arrive from. | https://lawsofux.com/paradox-of-the-active-user/ |
| Cognitive Load | A contractor between jobs has little attention to spare, so live screens should drop anything that does not help the task at hand (extraneous load), such as dead controls, internal jargon and empty sections placed ahead of real work. | https://lawsofux.com/cognitive-load/ |
| Default Effect | People tend to keep whatever is already selected or filled in and read it as the expected answer, so every prefilled value in this CRM must be the likely correct one for this customer, and a value left over from another person or client is worse than an empty field. | https://www.nngroup.com/articles/the-power-of-defaults/ |
| Peak-End Rule | Contractors remember a flow by its most intense moment and its last one, and negative moments stick most, so each finish (saved, sent, added, signed out, failed) must be truthful, visible where the thumb just was, and never leave them stranded. | https://lawsofux.com/peak-end-rule/ |
| The other common UX laws: Fitts's Law, Hick's Law, Jakob's Law, Miller's Law, Doherty Threshold | A contractor on a phone should reach the daily screens with the fewest, closest taps (Fitts, Hick), find that familiar controls do what they do elsewhere (Jakob), and see a response to every tap within 400 ms (Doherty); Miller's Law needs no change because the live screens are already chunked and its source warns against arbitrary limits of seven. | https://lawsofux.com/fittss-law/ |

## Changes applied, by area

### App shell: navigation, truthful status, search

- **Phone tab bar** (`nav.ts`; Serial Position Effect, Progressive Disclosure, Recognition Over Recall, Pareto Principle, Cognitive Load, Fitts's Law, Hick's Law): Leads is the only working daily list besides Today, yet it takes two taps while three tabs open 'Not available yet'. This is a deliberate, reversible departure from the Greenlane tab order; revisit when Pipeline is routed.
- **Pull to refresh** (`use-pull-to-refresh.ts`; Jakob's Law): The gesture currently announces 'Updated just now' after a fixed 800ms timer with nothing fetched, which is a fake status on the list a contractor checks for new leads. The test edit replaces only the pinned fake behavior (loop-constraints rule 6 still bars edits that hide a bug).
- **Pull to refresh wiring** (`ShellFrame.tsx`; Jakob's Law): router.refresh() is the read-only re-render the Leads 'Try again' button already uses. It keeps client state such as drafts and writes nothing to HighLevel.
- **Send feedback sheet** (`FeedbackSheet.tsx`; Peak-End Rule): send() discards the note and then says 'Sent. We read every note.' That is a false confirmation and breaks the no-fake-status limit. Disabling the textarea too avoids letting someone type a note they cannot send.
- **Top-bar Call buttons** (`ShellFrame.tsx`; Pareto Principle, Paradox of the Active User, Cognitive Load, Jakob's Law): The button has no onClick and looks active. Correction to the findings: the phone copy is already hidden at 1023px and below (globals.css:1957), so the visible fix is on computers; the hidden copy is changed so it cannot become a dead control later.
- **Tab and menu taps** (`ShellFrame.tsx`; Doherty Threshold): These force-dynamic routes have no loading.tsx, so on a weak job-site signal a tap can show nothing for well over 400ms and invite repeat taps. aria-current stays real so a screen reader is never told a page is open before it is.
- **Search rows from Today** (`use-search-rows.ts`; Recognition Over Recall, Hick's Law): Search is empty until Leads has been opened, so a real customer searched from Today gets 'Check the spelling'. Separate seed state lets a refreshed Today update its rows without touching what Leads handed in.
- **Search rows from Today** (`TodayLeadsCard.tsx`; Recognition Over Recall): It reuses data Today already loaded and the same row builder as Leads, so results read the same on both pages.
- **Search sheet scopes and copy** (`SearchSheet.tsx`; Recognition Over Recall, Hick's Law): Five of the seven chips can never return a row, and the copy promises quotes and invoice numbers that are not searchable. Scopes come back on their own as pages are wired because they follow the rows.

### Today

- **Today section order** (`TodayPage.tsx`; Law of Prägnanz, Serial Position Effect, Progressive Disclosure, Pareto Principle, Occam's Razor, Cognitive Load): On a phone the only card with real records sits below two empty cards. DOM order and visual order stay matched, so focus order remains correct.
- **Money section with no data** (`MoneyCards.tsx`; Aesthetic-Usability Effect, Law of Prägnanz, Occam's Razor): Three full-width cards with chevrons that lead nowhere become one compact list using the Settings row pattern. Each title keeps its own chip, so the chip-count pin at tests/features/today/today-real.test.tsx:59 still holds.
- **New leads rows** (`LeadsCard.tsx`; Pareto Principle): Seeing a new lead is the main reason to open the app, and /leads?row= already scrolls to and flashes that row via useRowFocus. The row keeps its 60-64px height and only navigates.
- **Leads failure state on Today** (`LeadsCardStatus.tsx`; Von Restorff Effect): A failure that stops leads reaching the contractor currently looks like the calm 'No leads yet' state.

### Leads

- **Add a lead form** (`AddLeadPanel.tsx`; Tesler's Law, Parkinson's Law, Jakob's Law, Default Effect): The phone keyboard's Go key does nothing today, and surnames and streets need manual capitals. display:contents keeps the layout; existing validation and focus-on-error are unchanged. The Cancel label must stay because swipe-down finds the button by that text (gestures.ts:147).
- **Add lead submit button** (`AddLeadPanel.tsx`; Von Restorff Effect, Law of Similarity): Filled only in the phone sheet, where it is the one focused task and matches other form submits. The computer panel stays tinted so it does not compete with the list.
- **Add a lead intro and labels** (`AddLeadPanel.tsx`; Cognitive Load): Three ways of marking optional fields and a three-sentence intro cost reading time while standing with a customer. The not-saved warning stays. The test edit covers only this intended copy change.
- **Phone action bar button** (`LeadsReady.tsx`; Zeigarnik Effect, Default Effect): Closing the sheet keeps typed details on purpose. The label shows a half-entered customer is waiting and warns that the form is not blank before it is reused for someone else.
- **Leads list** (`LeadsReady.tsx`; Law of Common Region, Recognition Over Recall, Paradox of the Active User, Cognitive Load): This removes a stray empty card outline and gives the reason for the disabled buttons where touch users can read it, since a title tooltip does not appear on a phone.
- **Hand-added lead row** (`AddedLeadRow.tsx`; Peak-End Rule): The only not-saved warning is in a sheet that has just closed, and a reload loses the lead.
- **Leads failure state** (`LeadsStatus.tsx`; Von Restorff Effect): Same failure treatment as Today, with the icon and words still carrying the meaning, so color is not the only signal.
- **Lead search results** (`search-rows.ts`; Recognition Over Recall): Search tells users to try a street name, but the address is not searchable. It also separates customers with similar names. No phone or email is added.

### Settings

- **Settings help text and save result** (`SettingsPage.tsx`; Tesler's Law, Peak-End Rule, Paradox of the Active User, Cognitive Load, Occam's Razor, Aesthetic-Usability Effect): Save only updates this browser session (live-save.ts:6-7), so 'Every page uses the new values' and 'A change here changes them too' are false. Folder and key terms mean nothing to a contractor. These test edits replace pinned copy that is untrue (loop-constraints rule 6 still bars edits that hide a bug).
- **Save result line** (`SettingsPage.tsx`; Law of Proximity, Zeigarnik Effect, Peak-End Rule): On a phone Save is sticky at the bottom and the result appears off screen at the top. The line also stays up while new edits are unsaved, which shows an unfinished task as finished.
- **Hint beside Save** (`SettingsPage.tsx`; Zeigarnik Effect, Paradox of the Active User, Tesler's Law, Occam's Razor): The current hint describes HighLevel internals. The new one shows pending edits and states the real limit of Save.
- **Save bar while searching** (`SettingsPage.tsx`; Law of Common Region): While searching, the Save bar floats above Connections or beside 'No settings match', where there is nothing to save.
- **Settings section list** (`SettingsPage.tsx`; Zeigarnik Effect): Drafts survive Back on a phone, but the section list looks untouched, so the route back to Save is not signposted.
- **Settings fields** (`ValueField.tsx`; Aesthetic-Usability Effect, Tesler's Law, Law of Proximity): Raw keys add a technical second line to about 31 fields. With the keyboard open, the top alert and the focused field are usually not visible together.
- **Save error placement** (`SettingsPage.tsx`; Law of Proximity): Each error shows once, next to its field, with the top alert kept as the fallback.
- **Focus after a failed save** (`use-settings.ts`; Law of Proximity): When an error switches section, the scroll-to-top currently runs after focus and pushes the field and its new message off screen.
- **Save error wording** (`validate.ts`; Tesler's Law, Paradox of the Active User, Aesthetic-Usability Effect): Once keys are no longer visible, an error naming a key cannot be matched to any field.
- **Save input handling** (`state.ts`; Tesler's Law): The app can safely fix input that is unambiguous, which saves retyping symbols on a phone keyboard. Nothing is guessed or silently downgraded, and values such as 'nope' still fail.
- **Connection rows with unknown status** (`ConnectionRow.tsx`; Law of Prägnanz, Occam's Razor): The same fact appears on every row beneath an intro that already says it. The chip and intro still claim no status.
- **Settings Sign out** (`SettingsPage.tsx`; Peak-End Rule): A failed sign-out is silent today, so an owner on a shared phone can walk away believing the session ended. The drawer already reports this failure.

### Auth forms

- **Invite accepted screen** (`InviteAcceptForm.tsx`; Goal-Gradient Effect): 'You are in' declares the goal reached while one step remains.
- **Invite form subtitle** (`InviteAcceptForm.tsx`; Goal-Gradient Effect): A trivial copy change that states what is really left, and shows the password minimum before a failed submit.
- **Sole next-step link** (`InviteAcceptForm.tsx`; Law of Similarity): A trivial change: a screen's only way forward should look the same across auth.
- **Expired reset link** (`ResetPasswordForm.tsx`; Peak-End Rule): A locked-out user is told to ask for a new link and given no way to do it, while Save can only fail again.
- **Your name field** (`Field.tsx`; Parkinson's Law, Default Effect): A one-line fix. Your name is the only auth field using the default text type, so email and password behave as before.

### Admin clients and mailbox prompt

- **Invite owner** (`ClientsTable.tsx`; Default Effect): One shared email state means client A's owner email can prefill client B's one-time owner invite, which is a cross-client access risk.
- **Row action results** (`ClientsTable.tsx`; Law of Proximity): An invite link shown away from its client can be sent to the wrong owner. role="status" stays, so the existing copy tests still find it.
- **Table spacing** (`ClientsTable.tsx`; Law of Proximity): A trivial change that stops 'Invite owner' sitting one text space from 'Turn off login', which locks a client out.
- **Mailbox reminder** (`MailboxPromptCard.tsx`; Law of Proximity): The card sits flush against the page heading, so an unrelated reminder reads as part of the greeting.

### Not available page

- **Unrouted pages** (`not-available-page.tsx`; Aesthetic-Usability Effect, Law of Prägnanz, Occam's Razor, Paradox of the Active User): The page says one thing three times, its lone row looks like a real record, and it is a dead end. The h1 and exact chip markup pinned by tests/app/unwired-pages.test.tsx are kept.

### Global CSS

- **Today tile chip at 320px** (`globals.css`; Aesthetic-Usability Effect): The comment says chips wrap, but white-space:nowrap stops them, so 'Not available yet' can run through the tile's padding. The width was calculated, not measured.
- **Save result inside the Save bar** (`globals.css`; Law of Proximity, Peak-End Rule): It gives the moved status line its own row above the button and wraps at 320px. The .fd-app prefix is needed to beat the existing .fd-app .fd-okl margin.
- **Leads failure state** (`globals.css`; Von Restorff Effect): It reuses the existing error tokens, adds no motion, and leaves the empty state unchanged.
- **Phone Settings Sign out** (`globals.css`; Law of Common Region): Sign out now sits under the Settings menu instead of inside whichever section is open, next to that section's Save.
- **Today lead row links** (`globals.css`; Pareto Principle): The row keeps its look as a link. The inset outline is needed because .fd-leads scrolls and would clip an outer focus ring.
- **Tab bar comment** (`globals.css`; Serial Position Effect): Keeps the comment true after the tab change.

## Laws with no change

- **Miller's Law**: The auditor found no violation: live screens are already chunked, and the law's source warns against applying an arbitrary limit of seven.
- **Law of Uniform Connectedness**: Its only finding was rejected. Most live surfaces already share frames, and the wait summary appears only after a hand-added lead until real wait data exists.

## Ideas rejected

- Zeigarnik Effect: Relabel the add-lead sheet's Cancel button to Close (Breaks a working gesture: pressSheetClose finds the button by the exact text 'cancel' (gestures.ts:147-150), so swipe-down on the sheet would stop working. The 'Finish le)
- Default Effect: Add a cancelAdd action so Cancel clears the add-lead form (Conflict resolved for the interrupted contractor. Swipe-down presses this same button, so one accidental swipe would erase a half-entered customer. The draft stays, and ')
- Progressive Disclosure: Hide Email and Full address behind 'Add email or address' in the add-lead sheet (Fewer fields lost to usefulness: the address is what a tradesperson needs for a visit, so hiding it adds a tap. Kept drafts could also be submitted from hidden fields. Th)
- Progressive Disclosure: Collapse Business details after 9 fields behind 'More business details' (Not small: it needs new state plus forced-open paths for search and validation errors. Removing the key lines already shortens the form considerably.)
- Law of Prägnanz: Show one money card with a single chip for all three titles (Merged into the one-list version, which gives the same simpler shape, keeps each section's status explicit and keeps the chip-count test valid.)
- Occam's Razor: Merge Needs you, calendar and the money cards into one card with a single chip (Over-collapses Today and removes the place each section returns to when wired. Reordering plus the money list solves the buried-leads problem.)
- Occam's Razor: Remove the top-bar Call button (Conflict with keeping the reference layout. Disabling it is honest, matches the disabled pattern on lead rows and is easy to wire later.)
- Law of Prägnanz: Delete 'We do not have these features yet.' in Settings (Low impact, and not trivial on a computer: the neighboring Your choices column keeps its sentence, so the two lists would stop aligning.)
- Recognition Over Recall: Add a 'Not available yet' chip to seven drawer items (Conflict with fewer elements: seven repeated chips would add the noise other laws remove, and would be tight at 320px. The tab change and the Leads link on unrouted pages)
- Law of Similarity: Tint Call or Reply on non-first waiting lead rows (No effect on live data: every real contact has status 'new' (load-leads.ts:15), which is read-only and not waiting. Revisit when real wait data is wired.)
- Law of Uniform Connectedness: Join the wait summary and lead list into one frame with CSS (A stretch today: real contacts have no wait data, so the summary appears only after a hand-added lead. It would change the reference layout for that rare state.)
- Goal-Gradient Effect: Add '2 of 5 done' to the dormant Needs you card (NeedsCard is not rendered and has no real completion data, so the change cannot be verified and may not survive wiring.)
- Tesler's Law: Add a native color picker to each brand color swatch (Low impact and not trivial: it adds a control and a 44pt target to 14 fields.)
- Tesler's Law: Use 'Not saved to HighLevel yet' in the Save confirmation (The truth problem is kept, but this wording names an integration a contractor does not need to know. One plain wording was chosen from the four proposed.)
- Paradox of the Active User: Keep the visible field key labels in Settings (Conflicts with Aesthetic-Usability and Tesler. Keys do not help a contractor and remain searchable.)
- Peak-End Rule: Return ok:false from the reducer on every edit (The render-time dirty check gives the same result without changing reducer behavior pinned at logic.test.ts:211.)
- Law of Common Region: Add a top border to each client row with border-collapse (Conflicts with the spacing fix, because collapsed borders ignore border-spacing. Spacing was chosen because it separates the lock-out action.)
- Law of Common Region: Wrap each brand color group in a tinted region (Low impact and not trivial: it needs new markup, a new rule and changed search behavior for empty groups.)
- Law of Proximity: Adjust brand color group heading margins (Low impact, and it needs an extra container rule to keep two-column labels aligned.)
- Von Restorff Effect: Add an alert icon to auth form errors (Low impact across five files. The errors are already worded and announced, so this is not an accessibility failure.)
- Parkinson's Law: Add an autoCapitalize prop to the auth Field (The one-line default based on field type gives the same result with no new prop.)
- Doherty Threshold: Apply the optimistic page to aria-current (A screen reader would be told a page is current before it has loaded. Only the visual state is optimistic.)

## After review

An independent review led to these changes on top of the plan: a newer search seed replaces older rows, lead rows can take focus after a Today link, the last nav tap wins, pull to refresh says "Refreshed" and is off on Settings, Settings' button is "Apply for this visit" because nothing is saved to the account, and a bare filename is not turned into a link.

## Open

- Disabled Call explains itself through its label and title only; touch users see a greyed button.
- Only `main_color` is contrast-checked. A pale `error_color` could make error text hard to read.
- A changed search seed drops hand-added leads from search until Leads is reopened.
- Real leads have not been seen on these screens yet.
