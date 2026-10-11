---
description: Move a shipped project from the build phase to the iteration phase
---

# /graduate - From build phase to iteration phase

Run once, when v1 has shipped. It retires `PRD.md` and the product-owner, keeps the few facts only the PRD holds, and switches the project to the lighter iteration workflow (`CLAUDE.md` "Starting work"). The main session runs this itself - it is a docs and agent-file change, not a build, so no agent is dispatched.

**Why:** during the build the PRD is the only place the spec exists, so it earns its keep. Once the app is live and one person decides scope, the code and tests describe behaviour better than a document updated after the fact, and keeping the PRD current costs more than the changes it describes. This is a one-way door for this project, so every step below confirms before acting.

## 1. Check readiness and confirm

Read `CLAUDE.md`, `PRD.md`, `BACKLOG.md` and the latest `CHANGELOG.md` entries. Report which of these hold, with evidence:
- The product is live, in front of real users.
- One person decides scope; nobody else needs to sign off a written spec.
- Work arrives as individual, mostly small requests, not a planned sequence of features.
- The PRD is being updated after the code, to match what shipped, rather than before it.

Also report any reason to stay in the build phase: several people deciding scope, an outside stakeholder who signs off a spec, regulated work or a need for an audit trail of what was specified. If any applies, recommend not graduating.

Stop and ask the user for explicit sign-off. Do nothing else until they give it.

## 2. Clear in-flight work

Check for uncommitted changes and open feature branches (Modes B and C). Anything in flight is finished and merged, or parked on its own branch, first. New requests that arrive during this run are logged, not folded in: the graduation is one clean, reviewable change. Then create the branch (`chore/graduate-to-iteration`) per `CLAUDE.md` "Version control".

## 3. Salvage, then confirm

Read `PRD.md` in full and list the facts the code cannot recover on its own:
- **Out of scope** - the explicit list of things the product deliberately does not do.
- **Deliberate product rules** - behaviour that would look like a bug without its reason (a limit set differently from an official rule, two data sets kept deliberately separate, and so on).
- Anything else the user would lose, such as a constraint not captured in `Layout:` or `.env.example`.

Check that `Layout:` in `CLAUDE.md` and `.env.example` are complete and current; add any missing layout choice or variable name (names only, never values).

Show the user the proposed list and where each item goes before writing anything. Most go in `CLAUDE.md` "Project-specific rules" as short "Out of scope" and "Product rules" lists; a rule that lives in one place in the code goes in a one-line comment there instead. Keep it short: a handful of lines, not a copy of the PRD.

## 4. Retire the PRD and the product-owner

- Delete `PRD.md` and `.claude/agents/product-owner.md` outright. No `-old` or archived copy: the CHANGELOG entry in step 7 is the record.
- Remove `product-owner` from the project-manager's `Agent(...)` tool list.

## 5. Sweep every reference

Update each of these so nothing still reads, cites or routes to the PRD or the product-owner:
- Every agent file in `.claude/agents/`, both the frontmatter `description` and the body.
- `CLAUDE.md`, `README.md`, `PLAYBOOK.md`, `BACKLOG.md`, the `CHANGELOG.md` header template.
- Every command in `.claude/commands/` (including `/pre-launch`, which reads `PRD.md` when one exists).
- `scripts/hooks/pre-commit` and any CI config that lists project documents.
- Code comments in the app that cite the PRD. Replace each citation with a short plain-English reason (or a CHANGELOG or BACKLOG reference); do not just delete a comment that explains a non-obvious rule.

Build-phase wording that is conditional ("in the build phase...") can stay in the kit files as it is; remove only what would now be wrong or empty.

## 6. Search twice

1. Case-insensitive search for `PRD` and `product-owner` across the project, excluding `node_modules`, `.git` and `CHANGELOG.md` history.
2. A separate search for the PRD's citation style without its name: `§` followed by a number, and phrases like "see section 4.2". Citations often drop the document's name over time, so the first search misses them.

Show the user both results. Anything left is either fixed or explained. Expect a second pass: the first sweep rarely catches everything.

## 7. Switch phase and record it

- Set `Phase: iteration` in `CLAUDE.md` "Project-specific rules".
- Run lint and tests if set up (comment-only changes should pass).
- Add one `CHANGELOG.md` entry: graduated to the iteration phase, PRD and product-owner retired, what was salvaged and where, and why.
- Update the `Last updated:` line of every document and agent file touched.

Docs and comments only, so no localhost review. Commit and wait for merge sign-off per `CLAUDE.md` "Version control". End with the standard end-of-task summary.
