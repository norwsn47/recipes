# PRD - Family Recipes
Last updated: 11 October 2026

## Problem
A small group (three or four people) want one place to share recipe ideas. Today recipes are scattered across links, screenshots and PDFs. They want a simple shared repository where each recipe is a link to a recipe online, uploaded file(s), notes, or a mix, and where it is clear who added it and roughly how much time it needs.

## Users
- Three or four named people (a household or friends) are the intended audience. Realistic ceiling is about five.
- Sign-in is with a Google account. **Any Google account may sign in; there is no email allowlist.** This is a deliberate decision by the project owner, made after being warned of the consequences (see "Accepted risks").
- All signed-in users have equal rights. There is no admin role in the app.
- Need: add a recipe quickly (on a phone), find something to cook, see who suggested it.

## Core features
Priority order.

1. **In-app Google sign-in, open to any Google account, with an app session.**
   - Signed-out visitors see only a sign-in screen (the Google sign-in button and the app name). No recipe data, no file, no list. Following a recipe link while signed out shows the sign-in screen, and after signing in the user lands on that recipe.
   - **Verified once, at sign-in.** The browser sends the Google ID token to the server once. The server verifies it: signature against Google's published keys, issuer, audience (this app's Google client ID), expiry, and that the Google account's email is verified. If any check fails, no session is created and the user is told sign-in failed.
   - **Then the app's own session.** On success the server creates a session row in D1 and sets the app's own session cookie: HttpOnly, Secure, SameSite. The cookie carries an unguessable random session identifier only (no identity data the client could alter).
   - **Every API request validates the session** (cookie present, session exists in D1, not expired). A missing, malformed, unknown or expired session gets 401. The server never trusts a request without a valid session. The Google token is not re-checked after sign-in and its expiry no longer matters mid-session.
   - **Session lifetime (confirmed by the owner, 11 October 2026):** 30 days, sliding (each use extends it, with the renewal write limited to at most about once a day to save D1 writes). After that the user signs in again.
   - **Sign-out** is available from every screen. It deletes the session row on the server, so the cookie stops working immediately, and clears the cookie in the browser.
   - **CSRF protection is required** on every mutating request (create, edit, delete, upload, sign-in, sign-out). The cookie being SameSite is not by itself enough. The mechanism (for example an Origin/Host check plus a custom-header or token requirement) is a developer decision, recorded in the code and reviewed by the code-reviewer. A cross-site request carrying the cookie must not change anything.
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
   - Time tag (required), exactly one of: "Less than 30 mins", "Around 1 hr", "Extensive prep"
   - Category tags (required, at least one), chosen from a fixed list: Breakfast, Chicken, Fish, Pork, Beef, Lamb, Dessert, Baking, Other. A recipe can have several. These are separate from the time tag and do not replace it.
   - Link (optional, maximum 2,000 characters)
   - Uploaded file(s), PDF, PNG, JPG or HEIC (optional). Maximum 5 files per recipe, 10 MB per file, 25 MB total per recipe.
   - Notes (optional), short plain text, maximum 2,000 characters
   - Added by (set automatically from the signed-in user, not editable)
   - Added date (set automatically)

   **Content rule:** a recipe must have at least one of: a link, one or more files, or notes. Title, time tag and at least one category tag are always required. Saving without at least one of link, file or notes shows a clear error and nothing is saved. A recipe is saved all-or-nothing: if any file fails validation or upload, no recipe and no partial files remain.
3. **Browse recipes.** A list of all recipes, newest first, each showing title, time tag, category tags, who added it, and whether it has a link, file(s) and/or notes.
4. **Filter and search.** Filter by time tag (one tag at a time, plus "All"), filter by category (one or more categories may be selected, plus "All"), and search by title (case-insensitive, matches anywhere in the title). The three combine with AND across types: a recipe must match the time tag, the category selection and the search text. Within the category filter, selecting several categories shows recipes that have any of them (OR). An empty result shows a "no recipes match" message. Nothing more (no ingredient or full-text search).
   - **Category tags are a fixed list (confirmed by the project owner for v1):** users cannot create, rename or delete category tags in v1. The list changes only by a code change. Custom tags are out of scope.
5. **View a recipe.** Shows all fields, opens the link (new tab), shows notes, and previews or downloads each file. A recipe URL for a recipe that no longer exists shows a clear "not found" message.
   - **HEIC (decided):** HEIC files are stored as uploaded, with no conversion and no new dependency. Safari previews them. Other browsers (Chrome, Firefox, including desktop) cannot, so they get a clearly labelled download (for example "Download HEIC photo (cannot be previewed in this browser)").
6. **Edit and delete own recipes.** A user can edit or delete only recipes they added. Enforced on the server, not just hidden in the UI. Editing can add or remove files, and change link, notes and category tags, subject to the content rule, the file limits and the usage limits below. Deleting a recipe also deletes its uploaded files. Delete asks for confirmation.
   - Delete order: the recipe record is removed first, then its files. If removing a file from storage fails, the user still sees the recipe deleted, the failure is logged, and the orphaned file is cleaned up by the owner by hand. Orphaned files are never reachable through the app because files are only served via an existing recipe.
7. **Usage limits (decided by the owner, replacing the earlier no-caps decision).** Reason: this is a small family app with very low expected use, and R2 can bill for overage, so open sign-in needs a ceiling. All limits are enforced on the server.
   - **Global storage cap: 5 GB** of uploaded files across all users. Uploads that would take the total past it are refused.
   - **Per user: 100 MB total uploads and 50 recipes.** Refused beyond either.
   - **Write rate limit: about 20 write requests per minute per user** (create, edit, delete, upload). Exceeding it returns 429 with a message. Exact figure and mechanism are a developer decision, provided it is roughly 20 per minute and does not itself cost many D1 writes.
   - **Existing limits stay:** 10 MB per file, 5 files per recipe, 25 MB per recipe.
   - Deleting a recipe, or removing a file while editing, frees that quota straight away.
   - Each refusal shows a clear message saying which limit was hit and what to do (see acceptance criteria).
   - The usage figures count stored file bytes (and recipe rows for the 50-recipe limit). They are not shown as a meter in v1.

## Sharing and output
- The product is a shared repository, so the "result" is the persistent list of recipes. Any signed-in user can return to it at any time.
- Each recipe has a stable URL (for example `/recipes/<id>`) so it can be pasted into a chat. The link only works for signed-in people; because any Google account can sign in, anyone who has the link can view it after signing in.
- Files are served only through an authenticated Worker route, never through public storage URLs.
- No public (signed-out) sharing, no native share sheet, no generated images, no export in this version.

## Copy rules (truthfulness)
- Nothing in the app may describe recipes or uploads as "private", "secure to the group" or "only visible to your group". Accurate wording, wherever visibility is mentioned at all: recipes are visible to anyone who signs in with a Google account.
- There is deliberately no visibility notice on sign-in or on the add-recipe screen (see "Accepted risks").
- No note on what is stored about users is shown in the app (project owner's decision).
- Limit messages must be accurate to the limits actually enforced.

## Data stored
Recorded here only, not shown in the app: per user, the Google email and display name (plus the stable `sub` ID); per session, a hash of the random session token (the raw token lives only in the browser cookie), the user and its expiry; per recipe, its fields, uploaded files and added date.

## Accepted risks
Recorded as informed decisions by the project owner, not to be re-raised in reviews:
- **Open access.** Because any Google account can sign in, anyone with the app's address can view every recipe and upload to storage, within the usage limits. There is a spam and abuse risk, and the project owner is responsible for content hosted by the app.
- **Free-tier exhaustion hard-stops, with no bill.** Workers Free and D1 Free stop rather than charge when their daily allowances run out: requests or queries fail with errors until the daily reset at 00:00 UTC. This is accepted: the app may be unavailable for the rest of a day if the allowance is used up.
- **Residual R2 overage.** The caps (5 GB global, 100 MB per user, rate limit) bound but do not eliminate R2 cost: R2 bills beyond its free allowance with no hard stop. The owner sets a Cloudflare billing/usage alert manually (not an app feature). Several accounts could still each reach their per-user share up to the global cap; the global cap is the backstop.
- **Moderation is manual.** The owner removes content directly in the D1 and R2 dashboards. There is no in-app admin and no report button. Other users cannot remove others' content.
- **Leavers and abusers.** Content stays when someone leaves or misbehaves. The owner deletes it by hand on request. Nothing is deleted automatically when a Google account disappears.
- **No data self-service.** Users cannot delete their account data themselves; deletion is manual on request to the owner.
- **No visibility notice.** The app does not tell users that their recipes and files are visible to every signed-in Google user. Users may therefore upload content without realising how widely it is visible.
- **One user can use up their own and, at worst, the shared quota.** A single abusive account can fill the global 5 GB cap (via 100 MB each across many accounts) and block uploads for everyone until the owner clears content by hand.
- **HEIC is not previewable outside Safari.** Other browsers get a labelled download.

## Out of scope
- Admin role, roles or permissions beyond owner-only edit/delete.
- Email allowlist, invitations, or in-app user management (access is open to any Google account).
- In-app moderation: admin screens, report button, content flagging.
- Usage dashboards or a storage meter in the app (the caps themselves are in scope, see Core features item 7).
- Self-service account or data deletion, data export.
- Cloudflare Access or any sign-in layer in front of the app.
- Public or anonymous (signed-out) viewing.
- Other sign-in methods (email/password, other providers).
- Comments, ratings, favourites, reactions, notifications.
- Structured recipe content: ingredient lists, method steps, scaling, unit conversion, shopping lists, meal planning.
- Free-form or custom tags (users adding, renaming or removing category tags; the fixed list is confirmed for v1, see Core features item 4; "Other" is the only catch-all) and ingredient fields.
- Importing or scraping recipe content from a link (the link is stored as given).
- File types other than PDF, PNG, JPG and HEIC (for example video, WebP, GIF, Word).
- HEIC conversion to another format (client or server).
- Native mobile app, offline mode.
- A logo, brand images or any other imagery for the app itself (v1 uses the app name as plain text; user-uploaded recipe files are unaffected).
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
- **Files served:** a file URL fetched without sign-in is refused. Files are not reachable through any public storage address.
- **Categories, add:** saving with zero category tags is rejected with a visible message by both the UI and the server and nothing is saved. A recipe with several category tags saves and shows them all.
- **Categories, validation:** the server accepts only values from the fixed list (Breakfast, Chicken, Fish, Pork, Beef, Lamb, Dessert, Baking, Other). Any other value (for example "Vegan", an empty string, a wrong-case variant, or a non-array) is rejected with a clear message and nothing is saved. Duplicate values in one request are rejected or collapsed to one.
- **Categories, edit:** editing a recipe can change its category tags, but removing the last one is rejected by the UI and the server, and the recipe is unchanged. The same fixed-list validation applies.
- **Categories, no custom tags:** there is no UI to create a category tag, and an API call with a new value is rejected.
- **Filter and search:** choosing "Less than 30 mins" shows only recipes with that tag; choosing "Chicken" shows only recipes with that category; choosing "Chicken" and "Fish" shows recipes with either; searching "pasta" shows recipes whose title contains it regardless of case; combining time tag, category and search shows the intersection across types; no match shows "no recipes match".
- **No privacy claims:** no text in the app calls recipes or uploads private or limited to the group (checked by reading all copy).
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
- Cloudflare Access is dropped. Reason: with open sign-in each person who authenticates consumes an Access seat until removed, and once the seat cap is reached new people are blocked, so strangers could lock out the real group.

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
- All three or four people can sign in with Google and add a recipe within a minute of opening the app, on a phone.
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
- Production URL: https://recipes.outbuild.uk (domain already on the owner's Cloudflare account). It must be added as an authorised JavaScript origin on the Google OAuth client.
- Google app status: stays in Testing mode with 4 test users until go-live (backlog #13). Until it is published, only those test users can sign in, so the "any Google account" rule (Users section) takes effect only at go-live. Publishing is a manual owner step before launch.
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
