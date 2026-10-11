# PRD - Recipes
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

1. **In-app Google sign-in, open to any Google account.**
   - Signed-out visitors see only a sign-in screen (the Google sign-in button and the app name). No recipe data, no file, no list. Following a recipe link while signed out shows the sign-in screen, and after signing in the user lands on that recipe.
   - The server verifies the Google ID token on every request: signature against Google's published keys, issuer, audience (this app's Google client ID), expiry, and that the Google account's email is verified. Any request that fails any check gets 401. The server never trusts a request without a valid token.
   - A user is identified by the Google account's stable subject ID (`sub`), not by email. Email and display name are stored for display and refreshed from the token on each sign-in, so a changed email or name on the Google account does not orphan or lose the user's recipes. Identity (id, email, name) always comes from the verified token, never from client input.
   - Sign-out is available from every screen.
   - Google tokens are short-lived (about an hour). When a token expires mid-session, the app refreshes it quietly where Google allows. Where it cannot, it re-prompts sign-in and keeps the typed title and notes (files may need re-selecting). A token expiry never shows a 401 error page and never loses the typed title or notes.
   - Cloudflare Access is not used (see "Tech stack & tools").
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
5. **View a recipe.** Shows all fields, opens the link (new tab), shows notes, and previews or downloads each file. A recipe URL for a recipe that no longer exists shows a clear "not found" message. How HEIC files display is an open question (Q5a).
6. **Edit and delete own recipes.** A user can edit or delete only recipes they added. Enforced on the server, not just hidden in the UI. Editing can add or remove files, and change link, notes and category tags, subject to the content rule and the file limits. Deleting a recipe also deletes its uploaded files. Delete asks for confirmation.
   - Delete order: the recipe record is removed first, then its files. If removing a file from storage fails, the user still sees the recipe deleted, the failure is logged, and the orphaned file is cleaned up by the owner by hand. Orphaned files are never reachable through the app because files are only served via an existing recipe.

## Sharing and output
- The product is a shared repository, so the "result" is the persistent list of recipes. Any signed-in user can return to it at any time.
- Each recipe has a stable URL (for example `/recipes/<id>`) so it can be pasted into a chat. The link only works for signed-in people; because any Google account can sign in, anyone who has the link can view it after signing in.
- Files are served only through an authenticated route, never through public storage URLs.
- No public (signed-out) sharing, no native share sheet, no generated images, no export in this version.

## Copy rules (truthfulness)
- Nothing in the app may describe recipes or uploads as "private", "secure to the group" or "only visible to your group". Accurate wording, wherever visibility is mentioned at all: recipes are visible to anyone who signs in with a Google account.
- There is deliberately no visibility notice on sign-in or on the add-recipe screen (see "Accepted risks").
- No note on what is stored about users is shown in the app (project owner's decision).

## Data stored
Recorded here only, not shown in the app: per user, the Google email and display name (plus the stable `sub` ID); per recipe, its fields, uploaded files and added date.

## Accepted risks
Recorded as informed decisions by the project owner, not to be re-raised in reviews:
- **Open access.** Because any Google account can sign in, anyone with the app's address can view every recipe and upload to storage. There is a spam and abuse risk, and the project owner is responsible for content hosted by the app.
- **No limits beyond per-file and per-recipe.** There are no per-user caps, no global storage cap and no rate limiting. The owner was shown that any signed-in user could fill the free storage allowance or exhaust free-tier limits. Only the per-file (10 MB) and per-recipe (5 files, 25 MB) limits apply.
- **Free tier exhaustion.** Because nothing caps usage, the free tier may run out, in which case saves and uploads fail until the owner acts (see Q18 for cost).
- **Moderation is manual.** The owner removes content directly in the D1 and R2 dashboards. There is no in-app admin and no report button. Other users cannot remove others' content.
- **Leavers and abusers.** Content stays when someone leaves or misbehaves. The owner deletes it by hand on request. Nothing is deleted automatically when a Google account disappears.
- **No data self-service.** Users cannot delete their account data themselves; deletion is manual on request to the owner.
- **No visibility notice.** The app does not tell users that their recipes and files are visible to every signed-in Google user. Users may therefore upload content without realising how widely it is visible.

## Out of scope
- Admin role, roles or permissions beyond owner-only edit/delete.
- Email allowlist, invitations, or in-app user management (access is open to any Google account).
- In-app moderation: admin screens, report button, content flagging.
- Per-user quotas, global storage caps, rate limiting, usage dashboards.
- Self-service account or data deletion, data export.
- Cloudflare Access or any sign-in layer in front of the app.
- Public or anonymous (signed-out) viewing.
- Other sign-in methods (email/password, other providers).
- Comments, ratings, favourites, reactions, notifications.
- Structured recipe content: ingredient lists, method steps, scaling, unit conversion, shopping lists, meal planning.
- Free-form or custom tags (users adding, renaming or removing category tags; the fixed list is confirmed for v1, see Core features item 4; "Other" is the only catch-all) and ingredient fields.
- Importing or scraping recipe content from a link (the link is stored as given).
- File types other than PDF, PNG, JPG and HEIC (for example video, WebP, GIF, Word).
- Native mobile app, offline mode.
- Anything above the three or four user scale for normal use (pagination, performance tuning for large libraries).

## Acceptance criteria
Each is testable by hand or by an automated test.

- **Sign-in:** a signed-out visitor to any page or API route gets the sign-in screen or a 401, never recipe data. A signed-out visitor opening a recipe link sees only the sign-in screen, then lands on that recipe after signing in.
- **Token verification (direct API call):** a request with a missing, expired, tampered (bad signature), wrong-audience, wrong-issuer or unverified-email token returns 401 and changes nothing.
- **Identity:** after a Google account's email or display name changes, signing in again keeps access to that user's existing recipes (matched by `sub`) and shows the updated name.
- **Sign-out:** after signing out, the app shows the sign-in screen and API calls with the old session return 401 once its token has expired. (Revocation before expiry is not required.)
- **Add:** with title, time tag and at least one of link/file/notes, the recipe saves and appears at the top of the list with the correct "added by" and date. Without a title, time tag, category tag, or all of link/file/notes, it is rejected with a visible message by both the UI and the server.
- **Added by:** sending a different "added by" in the request body has no effect; the server uses the verified identity.
- **Field limits:** a title over 100 characters, a link over 2,000 characters or notes over 2,000 characters is rejected by the server with a clear message.
- **Link:** only `http://` and `https://` links are accepted; other schemes (for example `javascript:`) are rejected.
- **Files, types:** PDF, PNG, JPG and HEIC files are accepted. Any other type, or a file whose content does not match an allowed type (checked by content, not just extension or declared type), is rejected with a clear message and nothing is stored.
- **Files, size and count:** a file over 10 MB is rejected. A sixth file on a recipe is rejected. A recipe whose files total over 25 MB is rejected (for example three files of 9 MB). Each rejection shows a clear message and nothing is stored. The same limits apply when editing (existing files count towards the 5 files and 25 MB).
- **All-or-nothing:** if one of several files fails, no recipe is created and no files remain in storage.
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
- **Token expiry:** with an expired token mid-way through adding a recipe, the app refreshes quietly or re-prompts sign-in; no 401 error page is shown and the typed title and notes are kept.
- **Cost:** see Q18; the original "no paid line item" criterion is under review because there are no usage caps.

## Tech stack & tools
Confirmed so far:
- Source control on GitHub; hosting on Cloudflare (stated intention).
- Sign-in: in-app Google sign-in (Google as identity provider), with the server verifying the Google ID token on every request.
- Cloudflare Access is dropped. Reason: with open sign-in each person who authenticates consumes an Access seat until removed, and once the seat cap is reached new people are blocked, so strangers could lock out the real group.

Everything else (frontend framework, API runtime, database, file storage, tooling such as the Cloudflare CLI) is pending the Stage 2 decision and is deliberately not written here yet. The owner's working assumption, from the moderation decision, is that data lives in D1 and files in R2, but this is not final until Stage 2.

HEIC handling is an open Stage 2 decision (Q5a).

Auth work is gated: no authentication code is built without explicit confirmation from the project owner.

Tools present on this machine: git, node 24, npm. `gh` and the Cloudflare CLI (wrangler) are not installed; the need for wrangler will be decided at Stage 2 and nothing is installed without asking.

## Environment variables
None confirmed yet; the list will be written once the stack is final (names live in `.env.example`).

Standing rules already agreed:
- The Google OAuth client secret and client IDs are never in the repo, `.env.example` values, or any log. They live only in environment configuration and the hosting platform's secret store or dashboard.
- Any non-secret value needed to verify sign-in (for example the expected audience / client ID) is configuration supplied by environment, not hardcoded.

## Success metrics
- All three or four people can sign in with Google and add a recipe within a minute of opening the app, on a phone.
- A signed-out request cannot read or write recipes or files (checked by direct API call without a token as well as through the browser).
- A user cannot edit or delete another user's recipe, including by calling the API directly.
- Uploads outside the file rules (type, size, count, total) are refused by the server.
- The group is still adding recipes a month after launch (informal, no analytics).
- Running cost stays at zero in normal use by the group (see Q18 for the unbounded-usage caveat).

## Constraints
- Layout: mobile-first (phone is the main device; desktop must still work). The project-manager records this on the `Layout:` line in `CLAUDE.md`.
- Cost: free tier only is the intent. Free-tier claims, status as at 11 October 2026:
  - R2 free allowance of 10 GB-month storage: assumed, not opened and read directly.
  - D1 free limits: not found, unverified.
  - Whether R2 requires a payment method and bills overage on a free account: unverified (Q18).
  These must be checked on the official Cloudflare pages at Stage 2, before the stack is locked.
- Security: every API request is authenticated server-side by verifying the Google ID token. Uploaded files are only served to signed-in users.
- Single-developer project, small data volume.

## Open Questions
Unanswered; none are assumed. Both remaining questions are settled at Stage 2.

**Files**
- Q5a. How should HEIC be displayed? Stage 2 decision; no approach is picked. Browsers other than Safari cannot display HEIC. Options and trade-offs:
  - Convert in the browser before upload (for example a WASM decoder library): the stored file is a displayable JPG, but adds a dependency and a sizeable download, can be slow or memory-heavy on a phone, and changes the original.
  - Convert on the server at upload: no client weight, but image decoding on Cloudflare's free compute has tight CPU and memory limits and also needs a library or an image service.
  - Store HEIC as is, display in Safari and offer download elsewhere: no dependency and the simplest, but HEIC is not previewable in Chrome or Firefox (including desktop), so some users only get a download.
  Also relevant: iOS often converts HEIC to JPG on its own when picking through a browser file input, which may make HEIC rare in practice. Lean: store as is with download fallback unless Stage 2 finds a cheap conversion; decide at Stage 2.

**Cost**
- Q18. The "no paid line item" criterion conflicts with having no caps. If R2 or D1 require a payment method and bill overage, a single abusive user could create a bill. Verify at Stage 2 whether the free plan can charge overage or hard-stops. Owner's decision rule: if it can charge overage, propose a billing alert and a minimal global storage cap for the owner to decide; if it hard-stops, accept that and relax the cost criterion to "free tier hard-stops are acceptable".
