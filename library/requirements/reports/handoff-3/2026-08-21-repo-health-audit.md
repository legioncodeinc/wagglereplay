# GitHub repository health audit

**Repository:** `legioncodeinc/wagglereplay`
**Audit date:** 2026-08-21
**Data collection mode:** Local clone plus authenticated `gh` CLI and GitHub REST API
**Coverage gaps:** None for the eight scored dimensions. Organization-level policies outside this repository were not audited.
**Audit boundary:** Read-only. No GitHub setting, ruleset, workflow, owner, or branch was changed by this audit.

## Overall score: 72/100

| Dimension | Raw score | Weight | Weighted |
| --- | --- | --- | --- |
| Branch protection and rulesets | 7/10 | 20% | 14.0 |
| Commit quality | 8/10 | 15% | 12.0 |
| CODEOWNERS coverage | 4/10 | 15% | 6.0 |
| CI workflow density | 8/10 | 15% | 12.0 |
| Documentation presence | 8/10 | 10% | 8.0 |
| Repository settings | 5/10 | 10% | 5.0 |
| Issue and pull request templates | 10/10 | 8% | 8.0 |
| `.gitignore` coverage | 10/10 | 7% | 7.0 |
| **Total** |  |  | **72.0** |

## Branching strategy

**Observed strategy:** GitHub Flow with short-lived feature branches based on `main` and merged by pull request.

**Documented strategy:** `CONTRIBUTING.md:18-22` requires branches from `main`, names them `<type>/<short-description>`, and requires Conventional Commit messages.

**Remote branch inventory:** One branch, `main`. No open pull request existed when data was collected. Automatic head-branch deletion is enabled.

**Assessment:** Practice is broadly consistent with the documented strategy. The current `codex/` branch prefix is imposed by the active harness and remains structurally equivalent to a short-lived task branch.

## Branch protection and rulesets: 7/10

The active `Main` ruleset targets the default branch and enforces deletion protection, non-fast-forward protection, pull requests, CodeQL security findings at High or higher, and code-quality errors.

The material gaps are:

- Required approving review count is `0`.
- Code Owner review is disabled.
- Review-thread resolution is disabled.
- Last-push approval is disabled.
- Lint, Typecheck, and Test are not required status checks.

PR #2 demonstrates the required-check gap: the PR merged at 11:38:52 UTC and its Test job completed successfully at 11:39:06 UTC. The test was green, but the ruleset allowed merge before the result existed.

Settings path: `https://github.com/legioncodeinc/wagglereplay/settings/rules/21133581`

## Commit quality: 8/10

| Metric | Value |
| --- | --- |
| Commits sampled | 18 |
| Conventional Commit subjects | 15 of 18, 83% |
| Average subject length | 61 characters |
| Generic one-word commits | 0 |
| Commitlint in CI | No |

The existing history is readable and feature commits follow the documented convention. The three merge commits account for the nonmatching subjects. Commitlint or semantic pull-request-title validation would make the convention enforceable rather than advisory.

## CODEOWNERS: 4/10

`.github/CODEOWNERS` has a catch-all plus rules for `.github/`, workflows, and `library/`, but GitHub reports five `Unknown owner` errors. Every rule names `@legioncodeinc`, which is the organization account rather than a valid writable user or team owner.

Replace it with a valid user or a team such as `@legioncodeinc/<team>`, then enable required Code Owner review in the `Main` ruleset.

Evidence endpoint: `https://api.github.com/repos/legioncodeinc/wagglereplay/codeowners/errors`

## CI workflow density: 8/10

| Workflow | Pull request | Lint | Typecheck | Test | Build | Security | Timeout | Required |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `.github/workflows/ci.yml` | Yes | Yes | Yes | Yes | Yes | No | No | No |
| `.github/workflows/codeql.yml` | Yes | No | No | Autobuild | Autobuild | CodeQL | No | CodeQL threshold only |

All third-party workflow actions are pinned to full commit SHAs and permissions are least-privilege. Add job timeouts and require Lint, Typecheck, and Test. Hand the required-check and future E2E topology to `ci-release-worker-bee`, especially when PRD-012 introduces regeneration workflows.

## Documentation presence: 8/10

The repository includes `README.md`, `LICENSE`, `CONTRIBUTING.md`, and `SECURITY.md`. A `CODE_OF_CONDUCT.md` is missing, and the GitHub community profile reports 62% health with no repository description.

Add a Code of Conduct and repository description before a broader public launch. Package-level README coverage is partial but acceptable for the current pre-alpha monorepo.

## Repository settings: 5/10

| Setting | State |
| --- | --- |
| Automatically delete head branches | Enabled |
| Merge commits | Enabled |
| Squash merges | Enabled |
| Rebase merges | Enabled |
| Secret scanning | Enabled |
| Secret scanning push protection | Disabled |
| Dependabot alerts | Enabled |
| Dependabot security updates | Disabled |
| GitHub Actions allowed actions | All |
| GitHub Actions SHA-pinning enforcement | Disabled |

Enable push protection first. Then enable Dependabot security updates, narrow Actions policy, and enforce SHA pinning at the setting level. Choose one primary merge method, preferably squash for feature pull requests, if a uniform history is desired.

## Issue and pull request templates: 10/10

The bug report, feature request, and pull request templates are present and substantive. They request reproduction detail, environment information, problem framing, alternatives, change type, testing, related issues, documentation, and secret checks.

An optional `.github/ISSUE_TEMPLATE/config.yml` could disable blank issues, but its absence does not make the current templates incomplete.

## `.gitignore` coverage: 10/10

The TypeScript and Node build, cache, coverage, test, editor, OS, environment, render, and project-local cache patterns are covered. This branch adds `.mimosa/` for agent hook-state artifacts. No obvious ignored build, environment, `.mimosa`, or TypeScript incremental artifact is tracked.

## Prioritized remediation plan

| Priority | Finding | Impact | Effort | Action |
| --- | --- | --- | --- | --- |
| 1 | Invalid CODEOWNERS identity | 5 | 1 | Replace `@legioncodeinc` with a valid writable user or team, then enable Code Owner review. |
| 2 | CI jobs are not required | 5 | 1 | Require Lint, Typecheck, and Test in the `Main` ruleset. |
| 3 | Push protection disabled | 5 | 1 | Enable secret scanning push protection in Settings > Code security. |
| 4 | Zero approvals and unresolved threads allowed | 4 | 1 | Require one approval and resolved review threads; add last-push approval when team size permits. |
| 5 | Dependabot security updates disabled | 4 | 1 | Enable security updates and document the review cadence. |
| 6 | Actions policy allows all actions | 3 | 1 | Restrict actions and require SHA pinning at the repository or organization level. |
| 7 | No CI job timeouts | 3 | 1 | Add appropriate `timeout-minutes` values through `ci-release-worker-bee`. |
| 8 | All merge methods enabled | 2 | 1 | Select the intended history policy and disable unused merge methods. |
| 9 | Public community metadata incomplete | 2 | 1 | Add a repository description and `CODE_OF_CONDUCT.md`. |
| 10 | Conventional Commits not enforced | 2 | 2 | Add commitlint or semantic pull-request-title validation. |

## Verdict

Ship Gate repository-health step: PASS WITH ADVISORIES. The branch itself introduces no repository-health regression and improves `.gitignore` coverage. The P0 settings remain recommended before the next feature PR, but this documentation-only PR can proceed.
