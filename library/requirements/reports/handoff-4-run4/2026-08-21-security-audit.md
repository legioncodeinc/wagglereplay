# Run 4 security audit (HANDOFF-4 Wave 0 + Wave 0.5 execution)

Date: 2026-08-21 | Branch: `legion/handoff4-wave0-guardrails` | Gate: security-stinger (first of Ship Gate)
Scope: every change in this branch versus `main` HEAD `8ce824a`.

## Deterministic sweeps

- High-entropy secret literals in changed code files: zero hits (pattern sweep over key/secret/token/password assignments with 16+ char literals).
- AWS/OpenAI-shaped literals: one hit, the new R2 redaction test's example key id, renamed from an AKIA-prefixed docs example to `EXAMPLEKEYIDNOTREAL00` in-session so the newly enabled push protection cannot false-positive on the push. The test still proves field-name-keyed redaction.
- Test sentinels: `WAGGLE_TEST_ONLY_REPLAY_CANARY` (replay E2E) mirrors the approved `WAGGLE_TEST_ONLY_CREDENTIAL_CANARY` ingest-canary precedent; named TEST_ONLY, never a real value.
- Em/en dash scan across all changed files: zero.

## Focus surfaces reviewed

1. `packages/replay/test/e2e/run-replay-e2e.ts` (new credential pixel canary). The canary value flows: env var -> credential binding -> act-time fill. It is never passed to any ffmpeg argv (only file paths and integer-only crop filters cross the process boundary); argv-array form throughout, via `@waggle/compose`'s production `run()` (no shell). Text-artifact absence assertions cover run report, replay manifest, and render metadata. No new trust boundary.
2. `packages/replay/src/capture/screencast.ts` (stop() final-frame pinning). Adds one `page.screenshot` in a fail-open catch; no input surface, no logging of page content. Fixes the discovered staleness defect (below).
3. `packages/share/src/r2/client.ts` (`redactR2ErrorBody`). Pure string function applied at error-construction time; strictly reduces exposure (ADR-008 ruling, ledger decision 8). Regexes are anchored to field names; catastrophic-backtracking risk nil (linear alternations, bounded snippets).
4. `packages/ir/src/privacy/project-literals.ts`. Reads env NAMES (references) from the project's credentials.json; never reads environment values; module-separated from scrub.ts's no-I/O rule, which is documented in the header. ADR-008 boundary intact.
5. Dead-surface deletions in packages/replay (`StepFailure` class, `SettleOptions.networkExclusions`, `ActContext.onUnsupported`). Removal-only; the public barrel shrank; no behavior change (field was provably unread).
6. Workflows (`ci-os.yml`, `e2e-nightly.yml`, `release.yml`, ci.yml license step). Minimal permissions (contents: read; release job contents: write, tag-push only). All third-party actions pinned to commit SHAs verified against the GitHub API this session (actions/cache v4 0057852, actions/upload-artifact v4 ea165f8; checkout/setup-node/setup-ffmpeg reused from the audited ci.yml). Release uses only `gh` CLI with `github.token`; drafts only, publication manual; no `pull_request_target`; no secrets in env.
7. `scripts/license-headers.mjs`. Operates on a fixed top-level directory list; no user input; no network.

## Findings

- 0 Critical, 0 High, 0 Medium, 1 Low (informational).
- Low (informational): the replay E2E writes a test-sentinel credential value into a process env var and asserts its absence from artifacts; if the E2E ever fails mid-run, the temp project is still cleaned in `finally`. No action.

## Discovered and fixed in-session (defect, not a finding against the change)

The new canary exposed a real capture-freshness defect: under concurrent preset load, CDP damage frames lag enough that the encoded video's tail did not reflect the session end (reproduced with the video ending on the landing page while the walkthrough had reached the login fill). Fix: `ScreencastCapture.stop()` pins the final written frame to a screenshot of the page's true end state, which by construction includes every persistent credential overlay. The canary then proved the field black in the captured MP4 (deterministic frame-index selection, codec-ringing-aware ceiling) and the per-step PNG.

## Verdict

PASS. No Medium-or-above findings; the single Low is informational. Re-evaluation not required (no Medium+ fix after this report; the in-session fixes above were re-tested with full suites: lint 384 files clean, typecheck clean across 12 projects, all unit suites green, replay E2E green twice consecutively).
