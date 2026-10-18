# PRD - Family Recipes
Last updated: 18 October 2026

## Problem
A small group (three or four people) want one place to share recipe ideas. Today recipes are scattered across links, screenshots and PDFs. They want a simple shared repository where each recipe is a link to a recipe online, uploaded file(s), notes, or a mix, and where it is clear who added it and roughly how much time it needs.

## Users
- Three or four named people (a household or friends) are the intended audience. Realistic ceiling is about five.
- Sign-in is with a Google account. **Access is limited to the Google accounts the owner has added as test users on the Google OAuth app** (Google Cloud Console, Audience -> Test users, up to 100; currently 4). The Google app stays in Testing mode permanently (owner decision, reversed on 11 October 2026; it replaces the earlier "any Google account may sign in"). There is no email allowlist in the app itself: Google enforces the test-user list.
- Adding or removing a person is a manual owner step in Google Cloud Console. There is no in-app user management.
- Users see Google's "app isn't verified" notice at sign-in and click Continue. This is expected and accepted.
- All signed-in users have equal rights. There is no admin role in the app.
- Need: add a recipe quickly (on a phone), find something to cook, see who suggested it.

## Core features
Priority order.

1. **In-app Google sign-in, limited to the owner's Google test users, with an app session.**
   - Signed-out visitors see only a sign-in screen (the Google sign-in button and the app name). No recipe data, no file, no list. Following a recipe link while signed out shows the sign-in screen, and after signing in the user lands on that recipe.
   - **Verified once, at sign-in.** The browser sends the Google ID token to the server once. The server verifies it: signature against Google's published keys, issuer, audience (this app's Google client ID), expiry, and that the Google account's email is verified. If any check fails, no session is created and the user is told sign-in failed.
   - **Then the app's own session.** On success the server creates a session row in D1 and sets the app's own session cookie: HttpOnly, Secure, SameSite. The cookie carries an unguessable random session identifier only (no identity data the client could alter).
   - **Every API request validates the session** (cookie present, session exists in D1, not expired). A missing, malformed, unknown or expired session gets 401. The server never trusts a request without a valid session. The Google token is not re-checked after sign-in and its expiry no longer matters mid-session.
   - **Session lifetime (confirmed by the owner, 11 October 2026):** 30 days, sliding (each use extends it, with the renewal write limited to at most about once a day to save D1 writes). After that the user signs in again.
   - **Sign-out** is available from every screen. It deletes the session row on the server, so the cookie stops working immediately, and clears the cookie in the browser.
   - **CSRF protection is required** on every mutating request (create, edit, delete, upload, favourite, un-favourite, sign-in, sign-out). The cookie being SameSite is not by itself enough. The mechanism (for example an Origin/Host check plus a custom-header or token requirement) is a developer decision, recorded in the code and reviewed by the code-reviewer. A cross-site request carrying the cookie must not change anything.
   - A user is identified by the Google account's stable subject ID (`sub`), not by email. Email and display name are stored for display and refreshed from the verified token on each sign-in, so a changed email or name on the Google account does not orphan or lose the user's recipes. Identity (id, email, name) always comes from the server-side session and verified token, never from client input.
   - **Session expiry mid-use.** If the session has expired (or was removed) while the user is using the app, the app re-prompts sign-in without showing a 401 error page. If this happens during adding or editing a recipe, the typed title, notes, link and chosen tags are kept (files may need re-selecting) and the save can be retried after signing in.
   - **Decisions recorded 11 October 2026 (after the localhost review):**
     - The sign-in screen shows only the app name and the Google button (outline theme, 280px wide).
     - No return path is stored. Sign-in renders at the same URL, so a recipe link shows the sign-in screen and the recipe appears once signed in.
     - If the app cannot check whether the user is signed in (network or server failure), it shows a "could not check sign-in" state with a retry button, not the sign-in screen or an error page.
     - Any unknown path (not a recipe id) renders the home list. A recipe id that does not exist still shows "not found".
     - The session cookie is SameSite=Strict. Only a hash of the session token is stored in D1; the raw token exists only in the cookie.
     - CSRF mechanism: the request Origin must equal the app's own origin and mutating requests must carry `X-Requested-With: fetch`. Both must pass.
     - Known issue, deferred (backlog #11): signing in as a different Google account at the session-expiry overlay is not handled correctly. Accepted for now.
   - Cloudflare Access is not used (see "Tech stack & tools").
   - **Auth build is gated:** no authentication code is built without explicit confirmation from the project owner.
2. **Add a recipe.** Any signed-in user can add a recipe with:
   - Title (required, maximum 100 characters)
   - Time tag (required), exactly one of three, shown as "< 30 mins", "1 hr" and "1 hr +" (meaning under 30 minutes, about an hour, and longer; display labels shortened by owner decision on 11 October 2026, the stored values are unchanged: "Less than 30 mins", "Around 1 hr", "Extensive prep")
   - Category tags (required, at least one), chosen from a fixed list: Breakfast, Chicken, Fish, Pork, Beef, Lamb, Dessert, Baking, Other. A recipe can have several. These are separate from the time tag and do not replace it.
   - Link (optional, maximum 2,000 characters)
   - Uploaded file(s), PDF, PNG, JPG or HEIC (optional). Maximum 5 files per recipe, 10 MB per file, 25 MB total per recipe.
   - Notes (optional), short plain text, maximum 2,000 characters
   - Added by (set automatically from the signed-in user, not editable)
   - Added date (set automatically)

   **Content rule:** a recipe must have at least one of: a link, one or more files, or notes. Title, time tag and at least one category tag are always required. Saving without at least one of link, file or notes shows a clear error and nothing is saved. A recipe is saved all-or-nothing: if any file fails validation or upload, no recipe and no partial files remain.
3. **Browse recipes.** A list of all recipes, newest first, each showing title, time tag, category tags, who added it, and whether it has a link, file(s) and/or notes.
4. **Filter and search.** Filter by time tag (one tag at a time, plus "All"), filter by category (one category at a time, plus "All"; owner decision, 18 October 2026, reversing the earlier any-of multi-category filter), and search by title (case-insensitive, matches anywhere in the title). The three combine with AND across types: a recipe must match the time tag, the selected category (if any) and the search text. Tapping a category shows only recipes with that category; tapping another switches to it; tapping the selected one, or "All", clears the category filter. A recipe itself still has one or more categories (the add and edit chips stay multi-select and wrap). The home screen layout, chip row, "More filters" disclosure and empty states are fixed in item 13 (final design, 18 October 2026); the Favourites toggle (item 12) is a separate filter, not part of the single-select category group, and combines (AND) with the category, the time tag and the search text. Nothing more (no ingredient or full-text search).
   - **Category tags are a fixed list (confirmed by the project owner for v1):** users cannot create, rename or delete category tags in v1. The list changes only by a code change. Custom tags are out of scope.
5. **View a recipe.** Shows all fields, opens the link (new tab), shows notes, and previews or downloads each file. A recipe URL for a recipe that no longer exists shows a clear "not found" message.
   - **HEIC (decided):** HEIC files are stored as uploaded, with no conversion and no new dependency. Safari previews them. Other browsers (Chrome, Firefox, including desktop) cannot, so they get a clearly labelled download (for example "Download HEIC photo (cannot be previewed in this browser)").
6. **Edit and delete own recipes.** A user can edit or delete only recipes they added. Enforced on the server, not just hidden in the UI. Editing can add or remove files, and change link, notes and category tags, subject to the content rule, the file limits and the usage limits below. Deleting a recipe also deletes its uploaded files. Delete asks for confirmation.
   - Delete order: the recipe record is removed first, then its files. If removing a file from storage fails, the user still sees the recipe deleted, the failure is logged, and the orphaned file is cleaned up by the owner by hand. Orphaned files are never reachable through the app because files are only served via an existing recipe.
7. **Usage limits (decided by the owner, replacing the earlier no-caps decision).** Reason: this is a small family app with very low expected use, and R2 can bill for overage, so a ceiling is kept even though only owner-approved test users can sign in. All limits are enforced on the server.
   - **Global storage cap: 5 GB (5 GiB, see item 10)** of uploaded files across all users. Uploads that would take the total past it are refused.
   - **Per user: 100 MB total uploads and 50 recipes.** Refused beyond either.
   - **Write rate limit: about 20 write requests per minute per user** (create, edit, delete, upload, and favourite or un-favourite, see item 12). Exceeding it returns 429 with a message. Exact figure and mechanism are a developer decision, provided it is roughly 20 per minute and does not itself cost many D1 writes.
   - **Existing limits stay:** 10 MB per file, 5 files per recipe, 25 MB per recipe.
   - Deleting a recipe, or removing a file while editing, frees that quota straight away.
   - Each refusal shows a clear message saying which limit was hit and what to do (see acceptance criteria).
   - The usage figures count stored file bytes (and recipe rows for the 50-recipe limit). They are not shown as a meter in v1.

8. **Decisions recorded 11 October 2026 (recipes stage A, after the localhost review):**
   - **Rate limit is approximate (owner accepted).** It is a fixed-window counter in D1 per user, so up to about twice the limit (about 40 writes) can pass across a window boundary. A Durable Object for an exact limit is not used. Over the limit, the response is 429 with `Retry-After: 60`.
   - **Recipe cap error:** the 51st create is refused with 409 `recipe_limit_reached` and the agreed message. The check is atomic with the insert.
   - **Editing is a full replace** (PUT with every field). There is no PATCH.
   - **Title search is case-insensitive substring matching done in the Worker**, so "%" and "_" are ordinary characters and non-ASCII letters fold case correctly.
   - **Empty link or notes are stored as no value** (blank or whitespace-only input counts as not provided, for the content rule too). Text fields are trimmed.
   - **No unsaved-changes warning** when leaving the add or edit form. Accepted for v1.
   - **Non-owner opening an edit URL** sees "You cannot edit this one" (the server still returns 403 on the write). A nonexistent recipe id shows "not found".

9. **Quick-add flow (owner decision, 11 October 2026; scope change).** Reason: most people will add only a name plus either a link or an uploaded file or photo; notes are rarely used. Adding must be as simple and easy as possible, on a phone first. This changes the add screen only. The fields, limits and content rule in item 2 are unchanged.
   - **Add screen starts with two big choices:** "Paste a link" and "Add photo or file". Each is a large tap target (at least 44 px, ideally much bigger).
   - **One file button covers camera, photos and files.** "Add photo or file" is a single file input, so on iPhone the system offers Take Photo / Photo Library / Choose File. The builder may use `accept` to limit to the allowed types (PDF, PNG, JPG, HEIC). Multiple files may be chosen, within the existing file limits. Server-side validation is unchanged and remains the real check.
   - **Name is pre-filled after the choice.** Once the user has pasted a link or chosen a file, the name field is pre-filled with a predicted name (see below) for the user to accept or edit. Title remains required, maximum 100 characters. A predicted name longer than 100 characters is truncated.
   - **Required tags are one-tap chips.** Time tag is a single-select chip group (exactly one). Categories are a multi-select chip group (at least one). Both stay required (owner decision); only the interaction is quicker. Chips have at least 44 px tap targets. Chip style (owner decision, 11 October 2026): on the add screen the categories are wrapping, tappable toggle buttons (chips), not a vertical list of checkboxes or radios, and the time tag uses the same chip style, single-select.
   - **Notes are de-emphasised** behind a small "Add notes" link that reveals the notes field. If notes already have content (for example after a session-expiry retry) the field is shown open.
   - **Editing an existing recipe** may keep a straightforward full form (all fields visible). It does not need the two-choice start.
   - **Content rule unchanged and still enforced server-side:** at least one of link, file or notes. The UI simply leads with link or file. A user who skips both choices and adds only notes (via "Add notes") can still save.
   - **Name prediction from a link (reverses the earlier "link scraping out of scope" for the title only).**
     - Instant guess in the browser: a name derived from the URL path slug (for example `/recipes/chicken-tikka-masala` gives "Chicken tikka masala"): last meaningful path segment, file extension removed, hyphens, underscores and plus signs to spaces, percent-decoding, first letter capitalised. If there is no usable slug (empty path, a numeric-only or id-like segment), no guess is shown.
     - Then the server fetches the pasted URL once and reads the page title, preferring `og:title`, then `<title>`, optionally JSON-LD Recipe `name`. If it returns a title, it replaces the slug guess **only if the user has not edited the name field** in the meantime.
     - If the fetch fails, is blocked, times out or finds no title, the slug guess stays. No error is shown to the user.
     - The prediction is only a suggestion. The user can always edit the name. Nothing is stored until Save. Only the title text is read: no other page content (ingredients, images, description) is extracted or stored. The link is still stored as given.
     - Site-name suffixes (for example "Chicken tikka | BBC Good Food") are not required to be stripped in v1; the user can edit. The developer trims a trailing " | Site" only (owner confirmed, 18 October 2026; " - Site" is left alone).
   - **Name prediction from a file.** Suggest the file name without its extension, tidied (underscores and hyphens to spaces, first letter capitalised, trimmed). For camera or device names that carry no meaning (for example `IMG_1234`, `DSC00012`, `PXL_20261011_...`, `image`, `Screenshot ...`, or names that are mostly digits), leave the name empty and show a placeholder prompt such as "Name this recipe". With several files chosen, the first file is used. If a link has already produced a name, a later file choice does not overwrite a name the user has edited or a name already filled from the link.
   - **Link title fetch: acceptance and security constraints.** A single authenticated endpoint (for example `POST /api/link-title`, developer decision) takes the URL and returns `{ title }` or an empty result. Requirements:
     - Authenticated users only (valid session; 401 otherwise). It requires the same CSRF protection as other API requests (Origin check and `X-Requested-With: fetch`).
     - Rate limited with its own limit of about 10 per minute per user, separate from the write limit (owner confirmed, 11 October 2026). Over the limit returns 429 and the app silently keeps the slug guess. The mechanism must not cost many D1 writes.
     - The URL must be `http` or `https` only, maximum 2,000 characters, and parse as a valid URL. Anything else is rejected with 400 and no outbound request. URLs with embedded credentials (`user:pass@`) are rejected.
     - Target restrictions: reject `localhost`, bare IP-literal hosts in private, loopback, link-local or otherwise reserved ranges, and non-standard-looking internal hostnames (no dot). The developer states in the code what Workers' own network isolation covers, and the code-reviewer checks this (SSRF).
     - Short timeout: about 4 seconds in total for the fetch including redirects. On timeout, abort and return empty.
     - Response size cap: read only the start of the body, stop early once the head is read or at about 64 KB, whichever comes first, and cancel the stream. Non-HTML content types (for example PDF, images) are not read: return empty.
     - No credentials forwarded: no cookies, no `Authorization` header, nothing from the user's request. The outbound request uses a fixed generic `User-Agent`, `Accept: text/html` and `redirect: manual` handling as below.
     - Redirects: a limited number (at most 3), each followed manually and each re-validated against the same http/https and target rules. A redirect to any other scheme or restricted target stops the fetch and returns empty.
     - Extracted title returned as **plain text**: HTML entities decoded, tags stripped, whitespace collapsed, control characters removed, capped at 100 characters. The client puts it into the input value as text and never renders it as HTML.
     - CPU-cheap parse: must stay within the Workers Free 10 ms CPU limit. A streaming parser (for example `HTMLRewriter`, already part of the Workers runtime, no new dependency) is the intended candidate. No new dependency without asking. JSON-LD, if included, is parsed only when small and is skipped if it risks the CPU limit. The developer measures and records the result.
     - Failures degrade silently: any error, block, timeout, non-HTML response, missing title, rate limit or non-2xx status results in the slug guess remaining, with no error message to the user.
     - Privacy: the target site sees a request from Cloudflare's network, not the user's IP address. The pasted URL is sent to the app's server even if the recipe is never saved, and is not stored or logged by the app (log the outcome class only, not the URL). The fetch result is not cached or stored.
     - The endpoint never fetches on page load, only when the user pastes or submits a link in the add flow; it fires once per distinct URL (debounced), not on every keystroke.
   - **Copy rules for this flow.** Button labels are "Paste a link" and "Add photo or file". The notes link reads "Add notes". The name field label stays "Name" or the existing title wording, with the placeholder "Name this recipe" when empty. No copy may say the app "reads", "imports", "saves" or "copies" the page or recipe from the link (only the title is suggested; the link is stored as given). No visible text about the fetch is needed. No copy may claim the fetch is private or anonymous beyond the factual point above, and nothing may call recipes private (see "Copy rules").

10. **Decisions recorded 11 October 2026 (recipes stage B, files, after the localhost review; owner said "looks good"):**
   - **Add entry point.** A floating circular "+" button at the bottom right of the list is how a recipe is added. It replaces the earlier top add button. The empty-library text points at it.
   - **Files are viewable by every signed-in user, the same as recipes** (owner confirmed). Nothing narrows file access to the recipe's owner.
   - **List versus detail.** List entries carry only whether a recipe has files; the file list (names, types, sizes) appears on the recipe detail only.
   - **File serving.** Files are served inline by default, or as an attachment with `?download=1`. The response uses `Cache-Control: private, no-cache`, so browsers always re-check before reuse (owner chose this over a 5-minute cache).
   - **Type check by content.** A PDF must start with `%PDF-`; a PDF with extra bytes before it is rejected (stricter than some PDF readers, accepted).
   - **Units.** "MB" means 1,048,576 bytes everywhere, so the 5 GB global cap is 5 GiB and 10 MB is 10 MiB.
   - **Cap responses.** The per-user storage, global storage and recipe caps return 409 (not 507), each with its own error code and the agreed message.
   - **Delete order.** The database record is removed first, then storage. A storage failure is logged and the user sees success (see item 6).
   - **Stray storage objects accepted.** An interrupted write (for example a connection drop mid-upload) can leave an unreferenced object in R2. Accepted; the owner cleans these by hand. They are never reachable through the app.
   - **Edit file-count fix.** When editing, the 5-file limit counts existing files plus new ones minus removed ones.
   - **Copy.** File-specific upload errors append "Remove that file below, or choose a different one, then save again." The content-rule error reads "Add a link, some notes or a photo or PDF so there is something to cook from."
   - **Layout detail.** The page does not use `viewport-fit=cover` (no edge-to-edge under the iPhone notch); the floating button is positioned within the normal viewport. Accepted.

11. **Decisions recorded 18 October 2026 (recipes stage C, quick-add and link-title lookup, after the localhost review; owner said "looks good"):**
   - **Header and settings.** The header shows the app name left-aligned and a settings (gear) icon button on the right (44 px target). The user's name is no longer shown in the header bar. The button opens a pop-up (design-system Dialog) containing: a short description, "Signed in as name (email)", a Sign out button and a Close button, and at the bottom the "Family Recipes by Outbuild ↗" mark (item 13). Description copy: "A shared place for the family to keep recipes: a link, a photo or a PDF, tagged by how long it takes and what kind of dish it is. Everyone who can sign in sees every recipe." Checked against the copy rules: it does not call recipes private or limited to the group, and says visibility truthfully. Sign-out is still reachable from every screen (header on every signed-in screen, via the pop-up).
   - **Category filter is single-select** (see item 4).
   - **Chips are visually smaller:** text-sm, 36 px visual height, with the 44 px tap target kept by an invisible band around each chip. Applies to filter, add and edit chips.
   - **Time chips** are toggle buttons (aria-pressed), single-select, not a radio group. Same visual style as category chips.
   - **Start screen** has an extra small "or just add notes" control for a notes-only recipe, in addition to the two big choices. The "Add notes" link on the form is unchanged.
   - **Name field behaviour.** A link-derived name can replace a name derived from a file if the user has not edited it. Clearing the link removes a link-derived guess but never a name the user edited. Client-side validation says "name" (not "title").
   - **Edit form** shows all fields open and does no link-title lookup or name prediction (name prediction is an add-flow feature only).
   - **Link-title lookup, accepted stricter or narrower behaviour than item 9 required:** URLs with a non-default port (anything other than 80 or 443) are rejected; hostnames with non-public suffixes (for example .test, .lan, .corp, .home, .local, .internal) are rejected as well as dotless names; the page's declared charset is honoured when decoding; only a trailing " | Site" is trimmed (not " - Site", which is common inside real recipe names); the parser stops after about 200 handler calls as a CPU safeguard, returning what it has or empty; the 10 per minute limit uses its own small D1 table (migration 0004), separate from the write limit.
   - **No DOM or component test dependencies for now** (owner decision); no additions to the approved dependency set.

12. **Favourites (owner request, 18 October 2026; scope change, reverses the "favourites" entry in Out of scope).** Reason: with a growing shared list, each person wants a quick way back to the recipes they actually cook. No new dependency.
   - **Heart button.** Each recipe card in the list shows a heart button at its top right, and the recipe view shows one too. Outline heart means not a favourite; filled heart means favourite. Tap toggles it.
   - **Personal to each user (owner decision).** A favourite belongs to the signed-in user who set it. Nobody sees anyone else's favourites, and there are no counts, "favourited by" lists or totals anywhere. The server returns only the current user's own favourite state for each recipe, and never another user's.
   - **Anyone can favourite anything.** Any signed-in user can favourite any recipe, including ones added by others. Favouriting does not change the recipe, its owner, or its edit and delete rights.
   - **Favourites filter.** A "♡ Favourites" toggle chip (aria-pressed) at the start of the chip row, before a thin divider and "All" (placement and chip styling in item 13). It is a separate toggle, not part of the single-select category group. Selected, the list shows only the user's favourites; it combines with AND with the selected category (if any), the time tag and the search text. Choosing a category or "All" does not change the Favourites toggle, and the Favourites toggle does not change the category. Tapping it again turns it off. Why separate, not a group member: a favourite is a property of a recipe, not a kind of dish, so "my favourite chicken recipes" is a natural ask; putting it in the single-select group would make that impossible and would silently clear one filter when the other is chosen. The cost is one extra independent toggle, which fits the existing "AND across types" rule. Empty-state wording is in item 13.
   - **Deleting a recipe removes its favourites** for every user who had it. Editing a recipe keeps them.
   - **Usage limits.** Favouriting and un-favouriting are writes and count against the write rate limit (about 20 per minute per user, item 7): they are cheap, but they are still D1 writes and the one limit keeps the rule simple. They do not count against the 50-recipe cap or any storage cap. Setting a favourite is idempotent (favouriting an already favourited recipe, or un-favouriting a non-favourite, is a harmless no-op, not an error). The route and mechanism are a developer decision, with the same session, CSRF and 401/429 handling as other mutating requests.
   - **Optimistic UI.** The heart flips at once on tap. If the server call fails (network error, 404 because the recipe was deleted, 429, 5xx), the heart reverts and a brief message shows, for example "Could not update your favourites. Try again." (429 uses the existing "You are doing that too fast. Wait a minute and try again."). If the session has expired, the app re-prompts sign-in as elsewhere and the heart reverts. While a request for a recipe is in flight, further taps on that recipe's heart are ignored or queued so the final state matches the last tap.
   - **Accessibility.** The heart is a real `button` with `aria-pressed` and one stable accessible name, "Favourite", that does not change between states (decided 18 October 2026 to avoid announcing the state twice; `aria-pressed` carries the state, and cards add the recipe title as a description). Tap target at least 44 px, with a visible focus state. The icon is not the only cue: state is exposed to assistive technology, and the filled/outline difference does not rely on colour alone.
   - **Does not trigger the card link.** Tapping the heart on a card never opens the recipe. The button is not nested inside the card's link (it is positioned over it as a sibling), and keyboard Enter or Space on the heart does not follow the link.
   - **Copy rules apply.** No favourites copy calls anything "private" or makes claims about who can see what beyond the factual "only you see your favourites", which is true of the app. Time and category labels are unchanged.
   - **Decisions recorded 18 October 2026 (favourites, after the localhost review; owner said "looks good"):**
     - **Server-side filter.** The list endpoint takes `GET /api/recipes?favourites=1` and returns only the session user's own favourites, combined with the other filters. Any other value means no favourite filter.
     - **Response shape.** Favouriting (PUT) and un-favouriting (DELETE) return 200 with `{favourite: bool}` (the resulting state), not 204. Both are idempotent.
     - **Card heart description.** On a card, the heart's `aria-describedby` points at the recipe title, so a screen reader hears "Favourite, [title]". The accessible name stays "Favourite" in every state.
     - **Failure notice.** A failed favourite change shows a notice in a `role="status"` region with a Dismiss button; it also dismisses itself after 6 seconds. A 401 reverts the heart silently (no notice) and re-prompts sign-in.
     - **Filter chip placement and empty states: superseded** by the final home screen design in item 13 (the Favourites chip no longer sits in a "Category" fieldset; the "No favourites match" state and its "Show all my favourites" button are gone). None of those earlier designs shipped.
     - **Un-favouriting while the Favourites filter is on (owner accepted).** The card stays visible, with an outline heart, until the list is next refetched (a filter change, search or reload). It is not removed at once. This lets a mis-tap be undone with a second tap.
     - **User change resets the favourites store.** The client favourites state is cleared when the signed-in user changes, by an effect in the app shell. A possible one-frame window in which the previous user's state could render is accepted (owner accepted); the server never returns another user's favourites, so no one else's data is exposed beyond that client frame.

13. **Home (list) screen, final design (owner decisions, 18 October 2026, after the localhost review; owner said "works").** Supersedes the earlier filter designs (a Favourites chip inside a "Category" fieldset, a "Show only favourites" switch, and an All/Favourites segmented control). None of those shipped.
   - **Order, top to bottom:** header, search, filters, list.
   - **Header:** app name on the left, settings gear on the right (unchanged, item 11).
   - **Search:** no visible label. A magnifying-glass icon sits inside the box, the placeholder is "Search recipes, e.g. pasta", and the accessible name is aria-label "Search recipes by name".
   - **One sideways-scrolling chip row**, with no visible "Category" label, as a `role="group"` with aria-label "Favourites and category". In order: a "♡ Favourites" toggle chip (aria-pressed; the ♡ is aria-hidden), then a thin decorative divider, then "All" and the single-select category chips. Favourites combines (AND) with category, time and search.
   - **Chip style:** outline when off, filled green when on; 36 px visual height with a 44 px tap target; focus ring on keyboard focus only (`:focus-visible`); no tap highlight.
   - **Time filter behind a disclosure:** "How long it takes" sits behind a "More filters" disclosure button (aria-expanded), 8 px under the chip row and 16 px before the list, 15 px medium-weight green text, 44 px tap area. While collapsed with a time filter active it reads "More filters (1 on)".
   - **Empty states:**
     - Favourites on, no other filter active and nothing favourited: "Tap ♡ on a recipe to save it here".
     - Any filter or filters hiding all results: "No matching recipes" with a "Clear filters" link that clears all filters, including Favourites.
     - No recipes at all: unchanged ("No recipes saved yet" ...).
     - The earlier "No favourites yet ...", "No favourites match" and "Show all my favourites" wording is removed.
   - **Outbuild mark moved (deliberate departure from `design-system/DESIGN.md`, owner decision).** The "Family Recipes by Outbuild ↗" mark (OutbuildMark) is removed from the bottom of the home screen and shown at the bottom of the settings pop-up instead. `design-system/DESIGN.md` says every Outbuild app shows the mark on its home screen; the owner has chosen otherwise for this app. Not a defect to re-raise in reviews.

## Sharing and output
- The product is a shared repository, so the "result" is the persistent list of recipes. Any signed-in user can return to it at any time.
- Each recipe has a stable URL (for example `/recipes/<id>`) so it can be pasted into a chat. The link only works for signed-in people; anyone who has the link can view it only if they are one of the owner's Google test users and sign in.
- Files are served only through an authenticated Worker route, never through public storage URLs.
- No public (signed-out) sharing, no native share sheet, no generated images, no export in this version.

## Copy rules (truthfulness)
- Nothing in the app may describe recipes or uploads as "private", "secure to the group" or "only visible to your group". Accurate wording, wherever visibility is mentioned at all: recipes are visible to every signed-in user.
- There is deliberately no visibility notice on sign-in or on the add-recipe screen (see "Accepted risks"). The settings pop-up carries one factual sentence ("Everyone who can sign in sees every recipe."), which is accurate and does not call recipes private.
- No note on what is stored about users is shown in the app (project owner's decision).
- Limit messages must be accurate to the limits actually enforced.
- Time tags are always labelled "< 30 mins", "1 hr" and "1 hr +" in the app (the longer stored names are never shown).

## Data stored
The link title lookup (Core features item 9) stores nothing: the pasted URL and the fetched page are used for the one request and discarded. Recorded here only, not shown in the app: per user, the Google email and display name (plus the stable `sub` ID); per session, a hash of the random session token (the raw token lives only in the browser cookie), the user and its expiry; per recipe, its fields, uploaded files and added date; per user, a list of favourite recipe ids (one row per user and recipe, with the time it was set). A favourite row is read only for the user it belongs to, is never shown to others and has no counts, and is removed when its recipe is deleted.

## Accepted risks
Recorded as informed decisions by the project owner, not to be re-raised in reviews:
- **Limited access, small residual risk.** Only Google accounts the owner has added as test users (up to 100, currently 4) can sign in, so the spam and abuse risk is much smaller than with open sign-in. Every signed-in test user can view every recipe and upload to storage, within the usage limits. The project owner is responsible for content hosted by the app and for who is on the test-user list.
- **Google "app isn't verified" notice.** Users see it at every sign-in and must click Continue. Accepted; no Google publishing, Branding page, privacy policy or home page is pursued.
- **Free-tier exhaustion hard-stops, with no bill.** Workers Free and D1 Free stop rather than charge when their daily allowances run out: requests or queries fail with errors until the daily reset at 00:00 UTC. This is accepted: the app may be unavailable for the rest of a day if the allowance is used up.
- **Residual R2 overage.** The caps (5 GB global, 100 MB per user, rate limit) bound but do not eliminate R2 cost: R2 bills beyond its free allowance with no hard stop. The owner sets a Cloudflare billing/usage alert manually (not an app feature). Several test users could still each reach their per-user share up to the global cap; the global cap is the backstop.
- **Moderation is manual.** The owner removes content directly in the D1 and R2 dashboards. There is no in-app admin and no report button. Other users cannot remove others' content.
- **Leavers and abusers.** Content stays when someone leaves or misbehaves. The owner deletes it by hand on request. Nothing is deleted automatically when a Google account disappears.
- **No data self-service.** Users cannot delete their account data themselves; deletion is manual on request to the owner.
- **Little visibility notice.** The app does not warn users at sign-in or when adding a recipe that their recipes and files are visible to every signed-in user. The only mention is one factual sentence in the settings pop-up (item 11). Users may therefore upload content without realising how widely it is visible. The app never calls recipes "private" (see "Copy rules").
- **DNS-rebinding residual in the title lookup (owner accepted, 18 October 2026).** A hostile hostname that resolves to an internal address after the checks is not fully closed off by the app's own checks. Also in BACKLOG "Known and accepted"; not to be re-raised.
- **Shared quota.** Test users can between them fill the global 5 GB cap (100 MB each) and block uploads for everyone until the owner clears content by hand. With a handful of owner-approved users this is unlikely.
- **HEIC is not previewable outside Safari.** Other browsers get a labelled download.
- **Title lookup makes the server fetch arbitrary user-supplied URLs.** Mitigated by the constraints in Core features item 9 (auth, scheme and target checks, redirect re-validation, timeout, size cap, rate limit). Only owner-approved test users can reach it. A suggested title from a hostile page is untrusted text and is only ever shown as plain text in an editable field.

## Out of scope
- Admin role, roles or permissions beyond owner-only edit/delete.
- In-app email allowlist, invitations, or in-app user management (access is limited by the Google test-user list, managed manually by the owner in Google Cloud Console).
- Publishing the Google OAuth app, the Google Branding page, a privacy policy or a home page (the app stays in Testing mode permanently).
- In-app moderation: admin screens, report button, content flagging.
- Usage dashboards or a storage meter in the app (the caps themselves are in scope, see Core features item 7).
- Self-service account or data deletion, data export.
- Cloudflare Access or any sign-in layer in front of the app.
- Public or anonymous (signed-out) viewing.
- Other sign-in methods (email/password, other providers).
- Comments, ratings, reactions, notifications. (Personal favourites are in scope since 18 October 2026, Core features item 12. Still out: shared or group favourites, favourite counts, seeing others' favourites, favourite collections or ordering, and favourites-based notifications.)
- Structured recipe content: ingredient lists, method steps, scaling, unit conversion, shopping lists, meal planning.
- Free-form or custom tags (users adding, renaming or removing category tags; the fixed list is confirmed for v1, see Core features item 4; "Other" is the only catch-all) and ingredient fields.
- Importing or scraping recipe content from a link: ingredients, method, images, descriptions or any other page content (the link is stored as given). The only exception is the suggested name (page title) in the quick-add flow, Core features item 9.
- Storing, caching or logging the fetched page or the pasted URL from the title lookup; a link preview card; re-fetching titles for saved recipes.
- A separate camera-only or files-only button, a drag-and-drop uploader, and an in-app image editor or cropper (one "Add photo or file" input is used).
- File types other than PDF, PNG, JPG and HEIC (for example video, WebP, GIF, Word).
- HEIC conversion to another format (client or server).
- Native mobile app, offline mode.
- A logo, brand images or any other imagery for the app itself (v1 uses the app name as plain text; user-uploaded recipe files are unaffected). The one exception is the "Family Recipes by Outbuild ↗" mark in the settings pop-up (item 13).
- PATCH (partial update) of recipes, an exact (non-approximate) write rate limit, and an unsaved-changes warning on the recipe form.
- Anything above the three or four user scale for normal use (pagination, performance tuning for large libraries).

## Acceptance criteria
Each is testable by hand or by an automated test.

- **Sign-in:** a signed-out visitor to any page or API route gets the sign-in screen or a 401, never recipe data. A signed-out visitor opening a recipe link sees only the sign-in screen, then lands on that recipe after signing in.
- **Google token at sign-in (direct API call):** a sign-in request with a missing, expired, tampered (bad signature), wrong-audience, wrong-issuer or unverified-email Google token creates no session, sets no cookie and returns an error.
- **Session on every request:** a request with no session cookie, a malformed cookie, an unknown session identifier or an expired session returns 401 and changes nothing. A valid session is accepted without re-verifying a Google token.
- **Cookie attributes:** the session cookie is HttpOnly, Secure and SameSite, and is not readable from page JavaScript. (Secure is checked on the deployed site; localhost may differ.)
- **Identity:** after a Google account's email or display name changes, signing in again keeps access to that user's existing recipes (matched by `sub`) and shows the updated name.
- **Sign-out:** after signing out, the app shows the sign-in screen, and an API call that reuses the old cookie returns 401 immediately (the session row is deleted server-side).
- **Session lifetime:** a session unused for 30 days returns 401; use within the 30 days extends it (the renewal write happens at most about once a day).
- **CSRF:** a mutating request sent without the required CSRF protection (for example from a foreign Origin or without the required header/token) is rejected and changes nothing, even though the browser attaches the session cookie.
- **Add:** with title, time tag and at least one of link/file/notes, the recipe saves and appears at the top of the list with the correct "added by" and date. Without a title, time tag, category tag, or all of link/file/notes, it is rejected with a visible message by both the UI and the server.
- **Added by:** sending a different "added by" in the request body has no effect; the server uses the session identity.
- **Field limits:** a title over 100 characters, a link over 2,000 characters or notes over 2,000 characters is rejected by the server with a clear message.
- **Link:** only `http://` and `https://` links are accepted; other schemes (for example `javascript:`) are rejected.
- **Files, types:** PDF, PNG, JPG and HEIC files are accepted. Any other type, or a file whose content does not match an allowed type (checked by content, not just extension or declared type), is rejected with a clear message and nothing is stored.
- **Files, size and count:** a file over 10 MB is rejected. A sixth file on a recipe is rejected. A recipe whose files total over 25 MB is rejected (for example three files of 9 MB). Each rejection shows a clear message and nothing is stored. The same limits apply when editing (existing files count towards the 5 files and 25 MB).
- **All-or-nothing:** if one of several files fails, no recipe is created and no files remain in storage.
- **HEIC:** a HEIC upload is stored unchanged. In Safari it previews; in a browser that cannot display HEIC the recipe shows a clearly labelled download that delivers the original file.
- **Global storage cap:** with the stored total at or near 5 GB, an upload that would exceed it is refused with a message such as "The app's shared storage is full, so this file could not be saved. Ask the owner to free up space." Nothing is stored, and the typed title and notes are kept. Text-only recipes are not blocked by this cap.
- **Per-user storage cap:** a user whose uploads would pass 100 MB in total is refused with a message such as "You have reached your 100 MB upload limit. Delete a file or recipe you no longer need, then try again." Nothing is stored; typed fields are kept.
- **Per-user recipe cap:** a user with 50 recipes cannot add a 51st; the message says "You have reached the limit of 50 recipes. Delete one to add another." Editing existing recipes still works.
- **Write rate limit:** more than about 20 write requests in a minute from one user returns 429 with a message such as "You are doing that too fast. Wait a minute and try again." Typed fields are kept. Reads (browsing, viewing) are not rate limited by this rule.
- **Quota freed on delete:** after deleting a recipe (or removing a file in an edit), the per-user and global usage drop by the freed bytes, the 50-recipe count drops by one, and an upload or add that was previously refused now succeeds.
- **Limits enforced server-side:** each cap above is refused by a direct API call as well as by the UI, with nothing stored.
- **Notes:** plain text only, rendered as text and never as HTML.
- **Edit/delete:** user B calling the edit or delete API on user A's recipe gets 403 and nothing changes. Deleting a recipe removes its files from storage (verified by trying to fetch a file URL afterwards, which fails). If storage removal of a file fails, the recipe is still gone from the app and the failure is logged.
- **Deleted recipe:** opening the URL of a deleted recipe shows "not found", not an error page or data.
- **Files served:** a file URL fetched without sign-in is refused. Files are not reachable through any public storage address. Any signed-in user can open any recipe's files. A file opens inline by default and downloads with `?download=1`; the response carries `Cache-Control: private, no-cache`.
- **Add button:** the list shows a floating circular "+" at the bottom right (at least 44 px) that opens the add screen; there is no add button at the top of the list.
- **Time tag labels:** the app shows "< 30 mins", "1 hr" and "1 hr +" everywhere (add, edit, filter, list, detail); the stored values are unchanged.
- **Categories, add:** saving with zero category tags is rejected with a visible message by both the UI and the server and nothing is saved. A recipe with several category tags saves and shows them all.
- **Categories, validation:** the server accepts only values from the fixed list (Breakfast, Chicken, Fish, Pork, Beef, Lamb, Dessert, Baking, Other). Any other value (for example "Vegan", an empty string, a wrong-case variant, or a non-array) is rejected with a clear message and nothing is saved. Duplicate values in one request are rejected or collapsed to one.
- **Categories, edit:** editing a recipe can change its category tags, but removing the last one is rejected by the UI and the server, and the recipe is unchanged. The same fixed-list validation applies.
- **Categories, no custom tags:** there is no UI to create a category tag, and an API call with a new value is rejected.
- **Home screen layout:** the order is header, search, filters, list. The search box has no visible label, a magnifying-glass icon inside, the placeholder "Search recipes, e.g. pasta" and aria-label "Search recipes by name". There is one sideways-scrolling chip row (`role="group"`, aria-label "Favourites and category", no visible "Category" label) holding "♡ Favourites" (aria-pressed, ♡ aria-hidden), a decorative divider, then "All" and the category chips. Chips are outline when off and filled green when on, 36 px visual with a 44 px tap target, show a focus ring on keyboard focus only and no tap highlight. The time filter is behind a "More filters" button (aria-expanded) that reads "More filters (1 on)" when a time filter is active while collapsed.
- **Home screen empty states:** Favourites on with no other filter and nothing favourited shows "Tap ♡ on a recipe to save it here". Any filters hiding all results show "No matching recipes" and a "Clear filters" link that clears every filter including Favourites. With no recipes at all, "No recipes saved yet" is unchanged.
- **Filter and search:** choosing "< 30 mins" shows only recipes with that tag; choosing "Chicken" shows only recipes with that category; then choosing "Fish" switches the filter to Fish only (Chicken is no longer applied); tapping the selected category again, or "All", clears the category filter; searching "pasta" shows recipes whose title contains it regardless of case; combining time tag, category and search shows the intersection across types; no match shows "No matching recipes" with "Clear filters".
- **No privacy claims:** no text in the app calls recipes or uploads private or limited to the group (checked by reading all copy).
- **Quick add, start screen:** opening Add shows two large choices, "Paste a link" and "Add photo or file", and the user can save a recipe with just a name, one time chip, one category chip and a link or a file, without touching notes. On iPhone Safari the file choice offers Take Photo, Photo Library and Choose File.
- **Quick add, chips:** time chips are single-select (choosing another replaces the first); category chips are multi-select. Saving with no time chip or no category chip is rejected by UI and server (unchanged rules). Chips have a 44 px tap target (visual height 36 px, see item 11).
- **Quick add, notes:** notes are hidden behind "Add notes" until tapped; a recipe saved with only notes (no link or file) still works; a recipe with no link, file or notes is still rejected by UI and server.
- **Name from link, instant:** pasting `https://example.com/recipes/chicken-tikka-masala` fills "Chicken tikka masala" immediately. A URL with no usable slug leaves the name empty.
- **Name from link, fetched:** for a page with an `og:title`, the name becomes that title (plain text, at most 100 characters) unless the user has already edited the name. With no `og:title`, `<title>` is used.
- **Name from link, failure:** a blocked, slow (over about 4 seconds), non-HTML, erroring or title-less URL leaves the slug guess in place with no error shown.
- **Name from file:** choosing `chicken_pie.pdf` fills "Chicken pie"; choosing `IMG_1234.jpg` leaves the name empty with the prompt "Name this recipe". The user can edit either. Nothing is saved until Save.
- **Link title endpoint, auth and abuse:** a call without a session gets 401; without the CSRF protection is rejected; more than about 10 per minute per user gets 429; non-http(s) schemes, URLs with credentials, `localhost` and private or reserved IP literals get 400 and no outbound request is made.
- **Link title endpoint, fetch safety:** the outbound request carries no cookies or `Authorization`; follows at most 3 redirects, re-validating each (a redirect to `file:`, `javascript:` or a private IP stops it); stops reading after about 64 KB or the end of `<head>`; does not read non-HTML responses; aborts after about 4 seconds.
- **Link title endpoint, output:** a title containing `<script>`, HTML entities, newlines or over 100 characters comes back as plain text, tags stripped, whitespace collapsed and capped; it appears in the name field as text and never executes.
- **Link title endpoint, CPU:** the parse completes within the Workers Free 10 ms CPU limit on typical recipe pages (developer measures and reports). If it cannot, the endpoint returns empty rather than exceeding it.
- **Link title endpoint, privacy:** a test target site sees a request from Cloudflare, not from the tester's IP, and no cookie or credential from the app. The pasted URL is not stored or logged by the app.
- **Edit form:** editing an existing recipe shows a straightforward full form with all fields open; the quick-add start is not shown and no link-title lookup runs there.
- **Settings pop-up:** the header shows the app name on the left and a gear button on the right, with no user name in the bar. The button opens a pop-up with the agreed description, "Signed in as name (email)", Sign out, Close, and the "Family Recipes by Outbuild ↗" mark at the bottom. Sign out ends the session; Close dismisses the pop-up. The mark does not appear on the home screen (owner decision, item 13).
- **Link title endpoint, extra rejections:** a URL with a port other than 80 or 443, or a hostname ending in a non-public suffix (for example .test, .lan, .corp, .home), gets 400 and no outbound request.
- **Favourites, toggle:** tapping the outline heart on a card or on the recipe view fills it at once and it stays filled after a reload; tapping again returns it to outline. The state is the same on the card and the view.
- **Favourites, personal:** user B does not see user A's favourites (a recipe A favourited shows an outline heart for B), the API never returns another user's favourite state, and no count appears anywhere. A user can favourite a recipe added by someone else.
- **Favourites, filter:** with "Favourites" on, only the user's favourites are listed; with "Favourites" on and "Chicken", "< 30 mins" and search text, only favourites matching all of them are listed. Choosing another category, or "All", leaves Favourites on; tapping Favourites again removes only that filter. Empty results show the messages in item 13.
- **Favourites, delete:** after a recipe is deleted its favourites are gone for every user (no orphan rows, and it no longer appears under Favourites). Editing the recipe keeps its favourites.
- **Favourites, limits:** favouriting counts towards the ~20 per minute write limit (429 beyond it, heart reverts with the message) and does not change the 50-recipe count or any storage figure. A direct API call without a session gets 401, without CSRF protection is rejected, and for a nonexistent recipe gets 404; repeating the same favourite or un-favourite call changes nothing further.
- **Favourites, failure:** when the call fails, the heart returns to its previous state and a brief message is shown (dismissible, and gone after about 6 seconds); no state is left half-set. A 401 reverts the heart without a message and re-prompts sign-in.
- **Favourites, API:** `GET /api/recipes?favourites=1` returns only the caller's favourites; PUT and DELETE on a favourite return 200 `{favourite: true|false}`.
- **Favourites, un-favourite under filter:** with Favourites on, un-favouriting a card leaves it visible with an outline heart until the next refetch.
- **Favourites, accessibility:** the heart is a `button` with `aria-pressed` and one stable accessible name ("Favourite", the same in both states; `aria-pressed` carries the state), has a 44 px tap target and a visible focus state, and tapping it (or pressing Enter or Space) on a card does not open the recipe.
- **Mobile:** every flow above (sign in, add with photo/file, browse, filter, view, edit, delete) works on a 375 px wide screen with one hand; tap targets are at least 44 px.
- **Session expiry mid-add:** with an expired or removed session part-way through adding (or editing) a recipe, the app re-prompts sign-in and shows no 401 error page; after signing in the typed title, notes, link and tags are still there and the save can be retried (files may need re-selecting).
- **Cost:** in normal use by the group the Cloudflare bill is zero. Worst-case spend is bounded by the 5 GB global cap. A Cloudflare billing/usage alert is set by the owner (manual step, confirmed before launch). Free-tier hard-stops on Workers and D1 are acceptable.

## Tech stack & tools
**Locked (owner decision, 11 October 2026):**
- **Frontend:** React 18, Vite and Tailwind v4 as a single-page app, using `design-system/` in place.
- **Backend and hosting:** one Cloudflare Worker that serves the SPA as static assets and handles `/api/*`. One deployable.
- **Data:** D1 for recipes, users and sessions. R2 for uploaded files, reachable only through an authenticated Worker route (no public bucket URL).
- **Sign-in:** in-app Google sign-in (Google as identity provider). The server verifies the Google ID token once at sign-in, then issues the app's own session cookie backed by a sessions table in D1. No client secret is used (ID-token flow).
- **Language:** TypeScript 6.0 (held below 6.1 for typescript-eslint).
- **Approved dependency set (owner decision, 11 October 2026):** react, react-dom (18), react-router-dom, jose, vite, @vitejs/plugin-react, tailwindcss, @tailwindcss/vite, @cloudflare/vite-plugin, vitest, @cloudflare/vitest-pool-workers, eslint, @eslint/js, eslint-plugin-react-hooks, globals, typescript, typescript-eslint, @types/react, @types/react-dom, wrangler. Nothing else is installed without asking.
- **Fonts:** the Google Fonts import is kept (owner decision). Consequence: visitors' IP addresses go to Google when fonts load.
- **Source control:** GitHub (stated intention); hosting on Cloudflare.
- Cloudflare Access is dropped. Reason: Access seats are consumed by each person who authenticates, which is an unnecessary layer now that Google's test-user list already limits who can sign in.

**Why this stack:** it matches the design system (React and Tailwind v4); there is no SEO or server-rendering need because every page is behind sign-in; it is one deployable; and all three services have free tiers suited to a group of this size.

**Cloudflare limits, verified on official Cloudflare pages on 11 October 2026:**
- Workers Free: 100,000 requests per day, 10 ms CPU per request, 100 MB request body. Past the daily limit requests fail with error 1027. No charge is mentioned.
- D1 Free: 5 million rows read per day, 100,000 rows written per day, 5 GB storage. Past the limits queries error until 00:00 UTC. No overage billing.
- R2: free allowance of 10 GB-month storage, 1 million Class A and 10 million Class B operations per month, free egress. Usage beyond that is billed, with no hard stop. R2 needs a subscription set up through checkout.

**Still unverified:**
- Whether R2 requires a payment method on file: the official page does not name one; a third-party source says a card is requested. Treat as unverified (Q-C1).
- Whether Workers static asset requests count toward the 100,000 requests per day limit (Q-C2). Does not change the design; affects how much headroom there is.
- The 10 ms CPU limit and the 100 MB body limit are above the app's own 10 MB file limit, so they do not constrain it, but the developer must check that upload handling (content sniffing, streaming to R2) stays within 10 ms CPU at 10 MB per file, and test it.

Auth work is gated: no authentication code is built without explicit confirmation from the project owner.

Tools present on this machine: git, node 24, npm. `gh` is not installed and nothing is installed without asking.

## Environment variables
Names live in `.env.example`; values never go in the repo.

- `GOOGLE_CLIENT_ID` - the Google OAuth client ID the server checks as the ID token audience. Not a secret. Worker configuration.
- `VITE_GOOGLE_CLIENT_ID` - the same value, exposed to the browser build for the Google sign-in button. Not a secret.
- **Usage limits are Worker configuration values** (non-secret vars in the wrangler config), with the agreed numbers as in-code defaults so the app works if a value is missing:
  - `MAX_TOTAL_STORAGE_BYTES` - global cap (default 5 GB).
  - `MAX_USER_STORAGE_BYTES` - per-user upload total (default 100 MB).
  - `MAX_USER_RECIPES` - per-user recipe count (default 50).
  - `WRITE_RATE_PER_MINUTE` - per-user write requests per minute (default about 20).
  - The per-file (10 MB), per-recipe (5 files, 25 MB), field-length and session-lifetime values are code constants, not configuration. Reason: they define the product's rules and the tests assert them; the four above are the knobs the owner may need to change without a code release if costs or abuse change.
- **`GOOGLE_CLIENT_SECRET` is not needed.** The ID-token flow verifies the token against Google's public keys and never uses a client secret. If any secret is later added (none is expected), it lives only in the Cloudflare secret store.

Standing rules:
- No secret is in the repo, in `.env.example` values, or in any log.
- For local development, values live in `.dev.vars`, which is gitignored.
- D1 and R2 are bindings declared in the wrangler config, not environment variables.
- The audience (client ID) used to verify sign-in is configuration, never hardcoded.

## Success metrics
- All three or four people can sign in with Google and add a recipe within a minute of opening the app, on a phone. With the quick-add flow, adding a link or photo plus two chip taps and a check of the suggested name should take well under that.
- A signed-out request cannot read or write recipes or files (checked by direct API call without a session as well as through the browser).
- A user cannot edit or delete another user's recipe, including by calling the API directly.
- Uploads outside the file rules (type, size, count, total) and beyond the usage caps are refused by the server.
- The group is still adding recipes a month after launch (informal, no analytics).
- Running cost is zero in normal use by the group; worst-case storage is bounded by the 5 GB cap, and the owner has a Cloudflare billing/usage alert in place.

## Constraints
- Layout: Mobile-first, confirmed (phone is the main device; desktop must still work). The project-manager records this on the `Layout:` line in `CLAUDE.md`.
- Design: the Outbuild design system in `design-system/` is accepted as is. The design review gate passed on 11 October 2026.
- Branding: no logo and no images. The app launches with its name as plain text (on the sign-in screen and in the header). The app is called "Family Recipes" (owner decision, 11 October 2026), shown as plain text.
- Cost: free tier is the intent; see "Tech stack & tools" for verified limits and the unverified points.
- Security: every API request is authenticated server-side by validating the app session. Uploaded files are only served to signed-in users. Mutating requests are CSRF-protected.
- Production URL: https://recipes.outbuild.uk (domain on the owner's Cloudflare account). It must be an authorised JavaScript origin on the Google OAuth client.
- Google app status: Testing mode permanently (owner decision, 11 October 2026). Only test users added by the owner in Google Cloud Console (Audience -> Test users, up to 100; currently 4) can sign in. Adding or removing a person is a manual owner step. Users see Google's "app isn't verified" notice and click Continue. No publishing, Branding page, privacy policy or home page is needed.
- Deployment (live): https://recipes.outbuild.uk, deployed as Cloudflare Worker "recipes" via GitHub (Workers Builds, main branch). Sign-in was confirmed working on the owner's phone.
- Local testing: Chrome and Firefox on http://localhost are supported. Safari on http://localhost is not supported (the Secure cookie is not accepted there); Safari is covered on the deployed HTTPS site.
- Manual owner step: set a Cloudflare billing/usage alert before launch.
- Single-developer project, small data volume.

## Open Questions
Unanswered; none are assumed. Q5a (HEIC), Q18 (cost), Q-S1 (session lifetime, 30 days sliding) and Q-N1 (app name: "Family Recipes") are closed: HEIC is stored as is with a download fallback outside Safari; cost is handled by the usage caps, free-tier hard-stops being accepted, and the owner's billing alert.

**Cloudflare cost**
- Q-C1. Does R2 require a payment method on a free account? Unverified. Lean: assume a card is needed and tell the owner before they start; check at account setup.
- Q-C2. Do Workers static asset requests count toward the 100,000 requests per day limit? Unverified. Lean: assume they do; fine at this scale, but check the dashboard after launch.

**Limits**
- Q-L1. Should the app show a user their own usage (for example "32 MB of 100 MB used")? Lean: no meter in v1; the refusal messages are enough. Owner may add it later.
