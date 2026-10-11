---
description: Full-codebase audit for accumulated issues
---

# /full-audit - Full-codebase audit

An occasional, deliberately expensive sweep of the whole app for issues the per-commit review gate never sees, because that gate only ever looks at one chunk's diff at a time. Run manually, only when there is token budget for it - not part of any standing flow.

This is not a launch gate (that is `/pre-launch`) and not an agent-setup review (that is `/process-review`). It looks at the actual app code across the whole repo.

## How to run this audit

Invoke the code-reviewer agent with the following brief:

"Run a full-codebase audit - not scoped to any particular chunk or recent change. First, read `CLAUDE.md` (the `Phase:` line and any 'Out of scope' and 'Product rules' lists), `PRD.md` if one exists (build phase only), package.json (or the equivalent) and the 'Known and accepted' section of `BACKLOG.md`, then work through the full codebase. Do not re-raise anything on the known-and-accepted list unless it has materially changed; if it has, say what changed. This is a flag-and-report exercise, not a fix-it pass: you never edit anything here (including BACKLOG.md), and nothing gets actioned without the user pulling it into work explicitly.

1. **Dead code** - unused exports, components nothing imports or navigates to, orphaned files, commented-out blocks left in place, unreachable branches.
2. **Unused dependencies** - cross-check `package.json` against actual imports; flag anything installed but never used.
3. **Duplicated or near-duplicated logic** - the same behaviour implemented more than once across files instead of shared.
4. **Inconsistent patterns** - error-handling shapes that differ across endpoints, naming inconsistencies, components that do not follow the established patterns in `design-system/DESIGN.md`.
5. **Stale BACKLOG items** - cross-check `BACKLOG.md` against the actual codebase: is anything listed already done, or no longer accurate?
6. **Full accessibility and security sweep** - the same checks the review gate runs per-chunk, but applied across every route and component, not just recently changed ones.
7. **Performance smells** - flag only; do not measure.

Report every finding, grouped by the seven headings above, as: FILE | ISSUE | SEVERITY (Critical / High / Medium / Low) | PROPOSED CALL (fix now / backlog / accept). Keep each finding to one line. Do not cap or cut findings: the filter applies to what becomes a to-do, never to what gets reported. Do not fix anything.

**Always escalate:** list every finding about security, privacy, data loss, or anything that makes user-facing copy untrue under its own "ALWAYS ESCALATE" heading at the top, whatever its severity (`CLAUDE.md` "Always escalate").

**What happens next (the main session, not you):**
- The user triages the whole report in one pass, confirming or changing each proposed call.
- **Backlog:** only findings the user marks 'backlog' go into `BACKLOG.md`, one to three lines each. Critical and High findings default to 'backlog' or 'fix now'.
- **Accept:** a one-line entry in the 'Known and accepted' section of `BACKLOG.md`, or a code comment where the issue sits in one place, so later audits don't raise it again.
- **Everything else** stays in the chat report. Nothing is filed automatically, and nothing is dropped silently.

Delegate anything needing root-cause investigation to the debugger using the existing handoff format - do not attempt it inline. Runtime performance measurement is done by the main session when asked: list it as a finding with a proposed call."
