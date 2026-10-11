# PLAYBOOK.md
Last updated: 27 September 2026
> Whenever you edit this file, update the "Last updated:" date above to today's date before saving.

*Everyday moves once v1 is shipped. Not a linear process - pick the move you need. `CLAUDE.md` is the authority for the rules. Some moves differ by phase (the `Phase:` line in `CLAUDE.md`): **build** keeps `PRD.md` and the product-owner; **iteration** (after `/graduate`) has neither.*

---

## Starting a session

Skim `BACKLOG.md` and the latest `CHANGELOG.md` entries. For a small, well-defined change, just ask for it. For a large or vague one:

> "Use the project-manager to plan and build [request]."

The project-manager scopes it, dispatches the specialists and the reviewer, then stops and hands back for your localhost review. You say "go ahead and merge" when you're happy.

---

## The moves

**New feature.** If it changes what the app does:
- **Build phase:** first, "Use the product-owner to add [feature] to the PRD. Confirm it fits current scope or flag if it changes what we're building." Once the PRD is signed off, ask the project-manager to build it.
- **Iteration phase:** ask the project-manager to plan and build it. It confirms scope with you before any code.

**Future idea.**
> "Add this to BACKLOG.md: [idea]. Don't build it now."

**Design tweak.** One component, no token change: ask the frontend-developer to make it within the existing tokens. Change to the design system itself (colour, spacing, type scale, a new component pattern):
> "Use the outbuild-design-director to change the design system - I want to change [what]. Explain what else will be affected first."

**Something is broken.**
> "Use the debugger. Here's what's broken: [exact error or behaviour]. It started after [last change or unknown]."

**Performance feels slow.**
> "Measure the performance of [what feels slow]: Core Web Vitals, bundle size, and the slow query or request. Report before changing anything."

The main session does this directly; there is no performance agent.

**PRD has drifted (build phase).**
> "Use the product-owner to run a PRD drift check."

If the PRD mostly gets updated after the code, to match what shipped, that is the sign to graduate instead.

**Ready to graduate.** v1 is live, you are the only one deciding scope, and work arrives as individual small requests: run `/graduate`. It retires `PRD.md` and the product-owner, keeps the out-of-scope list and deliberate product rules in `CLAUDE.md`, and switches to the iteration phase. Not sure? `/process-review` reports whether the project looks ready.

**Working through the backlog.** Ask for a batch: "Work through the accessibility items in BACKLOG.md." Non-visible batches (tests, docs, dead code) need only your merge sign-off. Visible batches need one localhost check.

**Security concern.**
> "Use the code-reviewer to run a security audit."

**Audit the whole codebase (run rarely).** `/full-audit`. Every finding comes back with a proposed call (fix now / backlog / accept), and anything about security, privacy, data loss or untrue copy is listed first for your decision. You triage the whole report in one pass: only what you mark "backlog" is filed, and accepted items go in "Known and accepted" so they aren't raised again.

**Is the process getting heavy?** `/process-review`.

**Pre-launch.** Ask the code-reviewer for a security audit, optionally ask for a performance measurement, then run `/pre-launch` for the four-gate check and a GO or NO GO. It is always exhaustive.

---

## Who to ask

| Situation | Agent |
|---|---|
| New project or large change | project-manager |
| PRD changes (build phase) | product-owner |
| Scope of a change (iteration phase) | you, via the project-manager |
| Change to the design system (rare) | outbuild-design-director |
| New feature - UI | frontend-developer |
| New feature - backend | backend-developer |
| Something broken | debugger |
| Security, or a review of a risky change | code-reviewer |

Everything else (small changes, branches, commits, BACKLOG edits you ask for, performance measurement, `/graduate`) is the main session.

---

## Things to remember

- **Human review is mandatory** for any browser-visible change. It cannot be skipped.
- **Build phase: the PRD is always current.** If a decision changes, the product-owner updates it immediately. In the iteration phase there is no PRD: the code and tests are the record of behaviour.
- **BACKLOG is a to-do list.** Only things you'd actually do. Finished items are deleted in the same commit. It is not a log of findings: accepted items go in "Known and accepted", and non-blocking review notes are never logged.
- **Always escalate:** security, privacy, data loss and untrue copy come to you whatever their severity.
- **One thing at a time.** Confirm each change works before starting the next.
- **Switch version control mode at any time:** "Switch version control to Mode [A/B/C] and update CLAUDE.md."
