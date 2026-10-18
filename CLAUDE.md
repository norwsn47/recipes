# CLAUDE.md
Last updated: 18 October 2026
> Ground rules for this project. Read this at the start of every session.
> Whenever you edit this file, update the "Last updated:" date above to today's date before saving.

---

## Project context
This is an Outbuild project. It lives in a dedicated folder (e.g. `~/Projects/[project-name]`).
Tech stack is TBD - stack decisions are made in onboarding Stage 2 before any code is written.

---

## Starting work

Check the `Phase:` line in "Project-specific rules" at the bottom of this file. Never infer the phase from which files exist.

- **Phase not set:** this is a new project. Say "Use the project-manager to start this session" and it runs the onboarding (see `README.md` for the four onboarding stages). It sets `Phase: build`.
- **`Phase: build`** (the first build, until v1 ships): `PRD.md` is the source of truth for what the app does and the product-owner keeps it current. Skim `BACKLOG.md` and the latest `CHANGELOG.md` entries, then carry on.
- **`Phase: iteration`** (after `/graduate`): there is no PRD or product-owner. The code and tests are the source of truth for behaviour; anything that changes what the app does is confirmed with you directly. Skim `BACKLOG.md` and the latest `CHANGELOG.md` entries. Small, well-defined changes: just do them. Large or vague work: dispatch the project-manager.

**Switching phase.** Once v1 is live, you are the only person deciding scope, and work arrives as individual small requests (or the PRD is being updated after the code rather than before it), run `/graduate`. `/process-review` also reports when a project looks ready. Keep the build phase instead if several people decide scope, someone outside the build signs off a written spec, or the work needs an audit trail of what was specified.

---

## Change size

**Small** - a single component or file, visual/copy/layout, a contained bug fix, config. No database schema, no auth, no API contract change, no new user-facing capability.
- Build it directly, or via frontend-developer / backend-developer.
- Review gate: `lint` and tests pass (if set up) -> human localhost review (mandatory for anything visible in the browser) -> commit. No separate reviewer agent unless it touches auth, security or user data.
- No PRD update, no project-manager, no CHANGELOG entry unless it records a decision or a reversal.
- Delete the finished item from `BACKLOG.md` in the same commit.
- A batch of small cosmetic changes given together is still small: one branch, one localhost review, one commit.

**Large** - backend logic, database schema or migration, auth, an API contract change, a new feature or user-facing capability, or anything touching several files across concerns. **Every feature built during the first build (onboarding Stage 4) counts as large.**
- The main session creates the branch, then dispatches the project-manager. It scopes, plans and orchestrates: it dispatches the specialist agents and the code-reviewer, keeps `BACKLOG.md` current, and stops before the localhost review.
- If the change alters what the app does: in the build phase the product-owner updates `PRD.md` first; in the iteration phase it is confirmed with you directly before any code.
- Full review gate (below).

If a "small" change turns out to need schema, auth, API or feature work, stop and treat it as large.

---

## Agent setup
Specialist agents live in `.claude/agents/`:
- **project-manager** - runs new-project onboarding; plans and orchestrates large changes; keeps `BACKLOG.md` current; stops before localhost review and merge
- **product-owner** - retired by `/graduate` on 18 October 2026 along with `PRD.md` (this project is in the iteration phase). Not available.
- **outbuild-design-director** - carries the Outbuild design philosophy; changes the design system when you ask (at the step 2.4 review gate or later), or creates one if the folder is emptied
- **frontend-developer** - builds UI from the design system, always reading `design-system/DESIGN.md` first
- **backend-developer** - builds APIs, database, auth, integrations
- **code-reviewer** - read-only reviewer for large or risky changes and the audit commands; hands findings back, never edits or commits
- **debugger** - root-cause investigation when something is broken

**Agents can't talk to you directly.** An agent runs to completion and returns to whoever dispatched it. When one needs an answer or a confirmation (a scope question, a stack choice, a design direction), it stops and returns its questions, grouped and at the end of its reply. The main session asks you, then continues or re-dispatches the agent with your answers. Agents never guess past a question that matters.

There is no performance agent: when runtime performance needs measuring, the main session does it.

Commands in `.claude/commands/`, run only when asked: `/full-audit`, `/pre-launch`, `/process-review`, `/graduate`.

Project documents in the root, kept current:
`CLAUDE.md` · `PRD.md` (build phase only) · `BACKLOG.md` · `CHANGELOG.md`, plus `design-system/DESIGN.md` (the project's one design file) and `.env.example` (environment variable names, no values; created at scaffold).

**BACKLOG.md** is a short to-do list so nothing is forgotten. Who edits it:
- **project-manager** (large changes) and **main session** (small changes, and when you say "add X"): delete finished items in the same commit as the change, and add genuine follow-ups.
- **Everyone else** never edits it. They report follow-ups in their handoff.
- **What gets in:** only something you would actually do - a real bug, a feature idea you asked for, or a manual step you owe. Critical/High review and audit findings go in; lower findings stay in the chat report for you to triage. Non-blocking review notes are never logged. Entries are one to three lines.
- **Accepted and won't-fix** decisions are never to-dos. They go in the "Known and accepted" section at the bottom of `BACKLOG.md` (one line each), or in a code comment when the issue sits in one place. Reviews and audits read that section first and do not re-raise what is on it.
- Its header has the full rules (IDs never reused).

**CHANGELOG.md** records decisions, reversals and notable behaviour changes, newest first. Git history is the full record of everything else.

**Date rule:** whenever a project document or an agent file is edited, update its `Last updated:` line to today's date before saving, written like `19 September 2026` (the date hook expects that format). Agent files rely on this rule rather than restating it. `scripts/hooks/pre-commit` enforces it when git is used (see "Version control").

---

## Design principles
Every project starts from the Outbuild design system in `design-system/`. At step 2.4 of onboarding there is a design review gate: you open `design-system/preview.html` and either proceed with the system as it is or ask for changes. The design system is a starter template: this project's copy of it can be edited directly, and `design-system/DESIGN.md` is the one design file.

- **The contract** is `design-system/DESIGN.md`. Read it before writing any UI code.
- **Use the system in place:** import `design-system/tokens.css` once in the app's stylesheet and import components from `design-system/components`. Do not copy, fork or edit them, and do not recreate a component it provides. If a project needs something the system lacks, build it following the system's rules and flag it as a candidate for the system.
- **Stack:** the system is built on React and Tailwind v4, so the PM recommends a stack that builds on them: React, Vite and Tailwind by default; Next.js or Astro (with React) when a project needs server rendering or search visibility. On a stack without React, only the tokens carry over.
- **To change the system** (colours, type, spacing, components), at the review gate or any time later, ask the outbuild-design-director. It explains what the change affects, confirms with you, then updates the tokens, the rules and the preview together. Open `design-system/preview.html` to see the system.
- Do not invent a visual style. Do not default to generic patterns.

**Assets:** brand assets live in `assets/logos/` and `assets/images/`. Always use these; never recreate logos in code or hotlink external logo URLs.

---

## Delegation

The project-manager never writes implementation code (application source, SQL, config). Editing project documents (`BACKLOG.md`, `CHANGELOG.md`, and `PRD.md` in the build phase) is part of its job. All implementation work goes to the right specialist agent. If a specialist hits a token limit or fails, the project-manager splits the task into smaller pieces and re-delegates; it never absorbs the work itself.

---

## File access
- **Only read and write files within the project folder.** Never touch anything outside it.
- If you ever need to reference something outside the project folder, ask first and explain why.

---

## Edits & confirmations
- For small, obvious changes (typos, single-line fixes): go ahead.
- For anything significant - modifying multiple files, changing structure, touching config - **show what you plan to do and wait for confirmation before doing it.**
- Never make silent edits. If something changed, say so.
- One change at a time. Confirm it works before moving on.
- If you weren't able to run or test something, say so explicitly. Don't claim it works unless verified.

---

## Secrets & security
- **Never hardcode API keys, tokens, passwords, or credentials** - anywhere, ever. Always use environment variables.
- Before touching anything related to authentication, tokens, or API keys, flag it and wait for confirmation.
- If you spot a secret hardcoded anywhere in the codebase, raise it immediately.

---

## Dependencies
- **Do not install packages without asking first.**
- When proposing a new dependency, explain: what it does, why it's needed, and what alternatives were considered.
- Keep the dependency set lean. No installing things speculatively.
- This applies to CLI tools too (Homebrew, gh, wrangler, Node/npm): check with `which <tool>` before assuming either way, and ask before installing.

---

## Version control
This project's mode is set during setup - see the project-specific rules at the bottom of this file. If nothing is set, ask the user before assuming anything.

**Mode A - No git (local files only).** No git commands. The review gate still runs, but there is no commit or push at the end.

**Mode B - Git local (no remote).** Local commits and branches only. No `git push`, ever.

**Mode C - Git + GitHub.** Full workflow with remote. All Mode B rules apply, plus: never push automatically (always confirm first), and never push to `main`.

**Rules for Modes B and C:**
- **Branch first, before editing a single file or dispatching any agent:** `git checkout -b <prefix>/<description>` from an up-to-date `main`. Never edit on `main` and branch later.
- Prefix is one of `feat/`, `fix/`, `chore/`, `refactor/`, `security/`.
- **The main session creates the branch and does the commits.** Agents (including the project-manager) never branch, commit, push or merge.
- One logical change per commit, and only after the review gate has run for that change.
- Never merge to `main` without the user explicitly saying "go ahead and merge". Implied consent is not sign-off.
- Never delete branches without confirming.
- If another Claude session is working in the same repo, use a separate `git worktree` so branch switches don't collide.
- **Date hook (recommended):** once per clone, run `git config core.hooksPath scripts/hooks`. It blocks a commit when a modified document or agent file has a stale `Last updated:` line.

---

## Review gate
Runs before a change is committed. Scales with change size (see "Change size").

**Small changes:**
1. `lint` and tests pass (if set up)
2. Human reviews the running app at localhost and confirms - mandatory for anything visible in the browser
3. Commit (Modes B and C), then wait for merge sign-off

**Large changes** (and anything touching auth, security or user data):
1. code-reviewer: static analysis (Critical findings block) and rendering verification, then hands back
2. Human reviews at localhost and confirms
3. Build phase only: product-owner PRD alignment check, if product behaviour changed - a conflict blocks the commit
4. Commit (Modes B and C), then wait for merge sign-off

The human localhost review is never skipped for anything browser-visible, however small. Docs-only and config-only changes skip it. If the gate hasn't run, the work is not done.

### Deviations
Every builder's handoff carries one line: "Deviations: anything built differently from what was asked (or from `PRD.md` in the build phase), and why", even for small, reasonable-looking calls. The agent does not decide how to resolve it. In the build phase the product-owner decides whether the PRD or the code changes; in the iteration phase you decide.

### Always escalate
Findings about **security, privacy, data loss, or anything that makes user-facing copy untrue** always come to you for an explicit decision, whatever their severity. They are never dropped or filtered out on a Low or Medium label alone. This applies to reviews and every audit command.

---

## Uncertainty
- Distinguish clearly between **Verified** (tested), **Assumed** (reasonable but untested), and **Estimated** (a guess).
- Never present an assumption as a fact.
- If unsure, ask - don't fill the gap silently.

---

## End-of-task summary
After every significant task, provide a short summary:
- What changed and why
- What was tested and what wasn't
- Any known risks or loose ends
- Recommended next steps
- Confidence score (1-10)

---

## Output conventions
These apply to all output, from the main session and from every agent. Agent files reference this section rather than restating it.

**Questions go at the end.** Present information, findings and recommendations first, then a clear separator, then the questions. Never split questions across different parts of a response.

**British English.** Colour not color, organise not organize, and so on.

**No em dashes.** Use a hyphen-minus (-) to separate clauses. This applies to every kind of output, including code comments and document content.

**Conversational responses are concise.** Lead with the answer or the action. This governs back-and-forth explanation, not structured deliverables with a fixed format (the reviewer's report, the `DONE` handoffs).

---

## Project-specific rules
<!-- Set during onboarding. Keep each line short. -->
Phase: iteration
Version control: Mode C (Git + GitHub). Remote: https://github.com/norwsn47/recipes (main auto-deploys to Cloudflare).
Layout: Mobile-first
<!-- Add any rules specific to this project below this line -->

**Out of scope** (deliberate; salvaged from the retired PRD, 18 October 2026)
- No admin role, in-app moderation, report button or in-app user management. Access is the Google test-user list.
- No Google app publishing, Branding page or privacy policy: the app stays in Testing mode permanently.
- No public or signed-out viewing, no other sign-in methods, no Cloudflare Access.
- No self-service account deletion, data export or usage meter.
- No comments, ratings, shared favourites or favourite counts.
- No ingredients, method steps, meal planning or custom tags; the category list is fixed in code.
- From a link, only the page title is read; pasted URLs and fetched pages are never stored or logged.
- Files are PDF, PNG, JPG and HEIC only, with no HEIC conversion. No native app or offline mode.
- No PATCH, no exact rate limit, no unsaved-changes warning.

**Product rules** (would look like bugs without the reason)
- Copy never calls recipes "private"; the only visibility statement is one sentence in the settings pop-up. Time labels show as "< 30 mins", "1 hr", "1 hr +"; the database keeps the longer stored names.
- Recipes can have several categories, but the list filter is one category at a time. Favourites is a separate chip that combines (AND) with the other filters.
- Favourites are personal, with no counts. Un-favouriting while the Favourites filter is on keeps the card until the next refetch, so a mis-tap can be undone.
- "MB" means 1,048,576 bytes. Cap refusals return 409. The ~20 writes/minute limit is a fixed window and approximate on purpose.
- The "by Outbuild" mark is in the settings pop-up, not on the home screen: a deliberate departure from `design-system/DESIGN.md`.
- Fonts load from Google Fonts (accepted: visitors' IP addresses go to Google).
- Deploy: apply new D1 migrations to remote before merging to main. The Google client ID is set both in `wrangler.jsonc` vars and as the Cloudflare build variable `VITE_GOOGLE_CLIENT_ID`. https://recipes.outbuild.uk must stay an authorised origin on the Google client.
- Local testing is Chrome or Firefox; Safari rejects the Secure cookie on http://localhost.

<!-- VERSION CONTROL MODE - set this during setup -->
<!-- Uncomment the line that applies:              -->
<!-- Version control: none (Mode A - local files only) -->
<!-- Version control: git local (Mode B - no remote)   -->
<!-- Version control: git + GitHub (Mode C - full)     -->
