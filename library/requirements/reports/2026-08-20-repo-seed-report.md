# Repository seed report: wagglereplay

Date: 2026-08-20 | Run: get-started-stinger + knowledge/ADR/PRD seeding | Executor: Claude (Cowork session), decisions by Mario Aldayuz across 5 interrogation rounds (20 decisions).

## 1. Already present

| Path | Status |
|---|---|
| README.md (15-byte GitHub stub) | Differed from template: REPLACED with owner's explicit approval (interrogation round 5) |
| .gitignore (GitHub default Node template) | Differed from template: REPLACED with owner's explicit approval (round 5); stinger baseline plus Waggle-specific entries |
| .git/ (clone of github.com/legioncodeinc/wagglereplay, branch main) | Untouched |

## 2. Created this run (87 files)

Community and CI baseline (get-started-stinger templates, placeholders resolved from git remote legioncodeinc/wagglereplay, branch main, Node 24, pnpm):
- .editorconfig, .nvmrc (24), .env.example (Waggle-specific variables), LICENSE (AGPL-3.0, exact SPDX text, per ADR-013)
- CONTRIBUTING.md, SECURITY.md (GitHub private reporting + mario@legioncodeinc.com), CHANGELOG.md (Keep a Changelog)
- CLAUDE.md (beyond the stinger template set: Hive project rules, locked-ADR pointer, ship gate, no-dash rule)
- .github/: CODEOWNERS (@legioncodeinc), dependabot.yml (npm + github-actions weekly), PULL_REQUEST_TEMPLATE.md, ISSUE_TEMPLATE/{bug_report,feature_request}.md, workflows/ci.yml, workflows/codeql.yml
- Action SHA pins resolved via GitHub API on 2026-08-20: actions/checkout v7.0.1 (3d3c42e5aac5ba805825da76410c181273ba90b1), actions/setup-node v7.0.0 (820762786026740c76f36085b0efc47a31fe5020), github/codeql-action v4.37.7 (ff2f1c621b7f889edc0d3c761ac2e6a3f8cdb0dd)
- ci.yml is bootstrap-safe: install/lint/typecheck/test steps guard on package.json and pnpm-lock.yaml presence and use --if-present, so the seeded repo is green and the pipeline activates when prd-001 lands. This was a deliberate deviation from "read commands from package.json scripts" (no package.json exists yet).

Library Schema v2 (all folder READMEs + documentation-framework.md from templates), plus:
- knowledge/private/architecture/: ADR-001 through ADR-015, all Accepted 2026-08-20 from the owner's interrogation answers. ADR-003, 004, 008, 009, 012 record where the open source pivot revised an earlier same-day answer.
- knowledge/private/waggle/: research corpus (capture-layer, replay-and-render, walkthrough-ir-and-project-format, voice-and-narration, composition, market-landscape, economics-archive, waggle-master-spec, README) with primary-source receipts inline.
- requirements/backlog/: 17 PRD folders (prd-001 through prd-017), each with an index (section 0 dependencies, phase, wave-ordered acceptance criteria, sub-10-minute task table with owning Bees) and an empty qa/ folder. Phases: 1 = prd-001..008 (record then narrate wedge), 2 = 009..012 (replay moat, credentials, vision QA, CI regen), 3 = 013..014, 4 = 015..017.

Verification executed: zero em/en dashes across all 90 files; leftover {placeholder} tokens exist only in the PR/issue templates where contributors fill them at use time (by design per stinger guide 02); PRD dependency graph is acyclic and every referenced ADR (001 to 015) and corpus doc exists.

## Delivery note: protected .github/ paths

The device bridge refused writes under .github/ (protected paths for remote tools), so the seven .github files landed in `_github-seed/` at the repo root with a MOVE-TO-DOT-GITHUB.md instruction file. Move them into `.github/` and delete `_github-seed/` before committing. Every other file wrote to its final path.

## 3. Needs a human decision

Requires GitHub Settings / admin access (this run cannot flip Settings):
- Enable Secret Protection + Push Protection (Settings, Advanced Security).
- Create a ruleset on main: require PR, require the CI status checks, require Code Owner review, block force pushes.
- Enable GitHub private vulnerability reporting (SECURITY.md names it as the primary channel; without the toggle the instructions are wrong).
- CodeQL: the committed codeql.yml is advanced setup; if you prefer native default setup, enable it in Settings and DELETE the workflow (running both conflicts).
- Add the repository description/topics; optionally verify the community profile with: gh api repos/legioncodeinc/wagglereplay/community/profile

Flagged defaults you may want to revisit:
- Dependabot shipped (Renovate is the swap if the monorepo's update noise grows).
- No pre-commit hooks yet; husky+lint-staged vs lefthook lands with prd-001.
- CODE_OF_CONDUCT.md not shipped (outside the stinger template set); GitHub's Add flow can generate one.
- LICENSE is AGPL-3.0 per ADR-013. A future dual-license or CLA decision only matters when outside contributions arrive.

## Ship gate reminder

Nothing in this seed is committed. Before any commit: security-stinger, then quality-stinger, then github-repo-health-stinger, reports into library/, medium+ findings fixed and re-checked, then owner approval to commit and push.
