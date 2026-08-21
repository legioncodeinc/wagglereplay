# HANDOFF 3: replay regeneration, credential masking, and the next build path

Audience: the next maintainer or agent picking up Waggle after PRD-009 and PRD-010. Written 2026-08-21 from merged `main` commit `9c7756deae14bbe37070849442ea5b4eff52b386`.

This handoff records the current working state, what shipped, the security and QA history behind it, the remaining boundaries, and the recommended order of work. PRD-009 and PRD-010 are complete and merged. The recommended default is to harden the repository rules, complete PRD-011 and PRD-012 while the replay seams are fresh, then close the zero-terminal desktop experience described by ADR-016 through ADR-019.

For current acceptance-criterion status, `EXECUTION_LEDGER.md` is the source of truth. For architecture, the accepted ADRs under `library/knowledge/private/architecture/` govern. `HANDOFF-2.md` remains useful for the phase 1 history and zero-terminal pivot, but its statements that PRD-009 and PRD-010 are unstarted are obsolete.

## Current state

| Item | State |
| --- | --- |
| Default branch | `main` |
| Merged application commit | `9c7756deae14bbe37070849442ea5b4eff52b386` |
| Feature commits | `97c9868` and `b684afe` |
| Merged feature PR | [PR #2: replay regeneration and credential masking](https://github.com/legioncodeinc/wagglereplay/pull/2) |
| PRD-009 | 8 of 8 acceptance criteria verified |
| PRD-010 | 5 of 5 acceptance criteria verified |
| Final security result | 0 Critical, 0 High, 0 Medium, 1 Low |
| Final automated suite | 764 of 764 tests passed |
| Main CI after merge | [CI passed](https://github.com/legioncodeinc/wagglereplay/actions/runs/32478163532) |
| Main CodeQL after merge | [CodeQL passed](https://github.com/legioncodeinc/wagglereplay/actions/runs/32478163488) |
| Main code quality after merge | [Code quality passed](https://github.com/legioncodeinc/wagglereplay/actions/runs/32478162026) |

The old remote feature branch was deleted after merge. Build new work from `origin/main` in a new isolated worktree. Do not continue on the old `legion/smoker-prd009-prd010` branch.

## Work completed

### Recovery and integration

The implementation began as an interrupted GLM-5.3 session whose source logs and partial checkout lived outside the normal branch flow. The recovery pass identified the substantive worktree, separated real changes from Windows line-ending noise, completed the missing implementation and evidence, and preserved unrelated user state.

The recovered work then passed security, quality, repository-health, CodeQL, and pull request review. Two feature commits were pushed to PR #2, all review findings were remediated in a follow-up commit, the PR was merged, and the resulting `main` commit was watched through fresh CI, CodeQL, and code-quality runs. All three post-merge runs completed successfully.

### PRD-009 replay engine

The replay engine now turns the Walkthrough IR into fresh browser pixels and feeds those pixels into the existing compositor. The implementation closes the central regeneration promise that phase 1 left open.

The shipped behavior includes:

- A step-to-Playwright mapper with selector fallback, structured `StepFailure` output, and a settle ladder that records how each step reached stability.
- Deterministic browser context setup with fixed locale and timezone, reduced motion, animation suppression, storage-state support, and configurable network exclusions.
- CDP screencast capture piped to ffmpeg as H.264 video-only output, including backpressure, asynchronous error propagation, frame acknowledgement, cleanup, and per-step timing manifests.
- Replay viewport authority over recorded `setViewport` steps, so each configured output preset controls the actual browser viewport.
- Native and reframed preset modes, native-reflow probing, and focus-point tracks consumed by the compositor.
- A real `waggle regen` command that runs configured presets, uses distinct work directories and source identities, and writes `renders/regen/latest-run.json`.
- Bounded preset concurrency through `WAGGLE_RENDER_CONCURRENCY`, with strict parsing and a tested worker pool.
- A moved-button drift test that runs real Chromium and ffmpeg. The stale primary selector fails, the accessible fallback succeeds, and the report records the fallback index.
- Checked-in native and reframed manifests, screenshots, and a drift run report under the PRD QA directory.

The final CodeQL remediation replaced interpolated initialization-script source with a Playwright function plus separately serialized data. Network exclusions are read lazily so initialization order cannot capture stale configuration. No `eval`, `new Function`, or equivalent executable-source construction remains in the replay path.

### PRD-010 credentials and masking

Credential handling now keeps secret values outside project files and limits value access to the exact replay action that needs them. Capture, replay, ingest, prompt construction, and narration share an end-to-end redaction contract.

The shipped behavior includes:

- A strict canonical `credentials.json` schema that stores environment references, not values.
- `waggle creds check`, which prints credential names and status without printing references or values.
- Callback-only environment resolution at replay action time. The public replay credentials API does not expose a plaintext resolver.
- RFC 6238 TOTP generation with standard vectors and act-time seed resolution.
- Studio UI and API support for marking username, secret, and TOTP fields.
- Extension telemetry that marks later input events with a fixed `[REDACTED]` placeholder and never stores the value or its length.
- Credential overlays that remain active in replay video frames and screenshots.
- Capture geometry clipped to the recorded CSS viewport. Missing, non-finite, zero-size, or out-of-bounds persisted geometry fails closed before PNG output is created.
- Video-relative activation anchored to `meta.video.anchorEpochMs`, not to the first event in the session.
- ffmpeg redaction boxes projected with decoded-frame `iw` and `ih`, so opaque masking persists across frames and output dimensions.
- Provider image confinement to extractor-attested PNGs inside the project. Filename traversal and symlink escape paths are rejected.
- A shared text scrubber used by pre-draft vision requests and narration.
- A real ffmpeg and provider canary that proves marked pixels are black in every stored QA PNG and that provider-bound bytes exactly match a persisted redacted PNG.

The original source recording remains sensitive local input and is not rewritten. All derived QA images and provider-bound images follow the redaction boundary.

### Mimosa cleanup

The untracked root `.mimosa/` directory contained local hook-state artifacts from the interrupted session. It was removed from the workspace. This handoff PR also adds `.mimosa/` to `.gitignore` so those machine-local files do not repopulate Git status or enter a future commit.

The removed files were untracked, so their deletion does not appear as a Git deletion. The durable repository change is the ignore rule.

## Security and QA history

The feature passed three review cycles. Keep this chronology because the first green unit suite did not prove the full media boundary.

### Initial security audit

The first security pass found and fixed four High-severity issues:

1. Continuous replay video could expose a credential before screenshot-only masking took effect.
2. A public API could resolve plaintext credential values outside the replay action callback.
3. A compose source path could escape the project directory.
4. Pre-draft could read an out-of-project image.

### Initial quality audit

The first quality pass then found an additional end-to-end gap: capture-derived QA PNGs and provider-bound image bytes could remain unredacted even though structured text was scrubbed. Unit tests had proved overlay order and text handling, but not real extracted pixels.

The fix added bounded geometry, validation before output creation, time-aligned ffmpeg drawboxes, extractor-attested image allowlisting, and a real pixel-level provider canary.

### Post-redaction security audit

The second security pass found and fixed three more High-severity issues:

1. An unredacted QA or provider image path remained reachable.
2. Redaction timing used the wrong origin.
3. Source filenames could use traversal or symlink behavior to escape confinement.

### Pull request review and final audit

PR review found the CodeQL executable-source issue in deterministic browser initialization and two lower-level code quality issues. Commit `b684afe` fixed all three. Fresh security and quality reports then confirmed that every PRD-009 and PRD-010 acceptance criterion remained verified.

The final unresolved result is 0 Critical, 0 High, 0 Medium, and 1 Low. The Low item is the pre-existing Studio loopback server boundary, which has no per-launch authentication token. That risk remains limited while Studio binds only to loopback, but it should be closed before broader desktop distribution or any network exposure.

## Verification evidence

The final tree passed all of the following:

| Verification | Result |
| --- | --- |
| `pnpm lint` | Passed across 380 files |
| `pnpm typecheck` | Passed for every workspace package; Svelte reported 0 errors and 0 warnings |
| `pnpm build` | Passed |
| `pnpm test` | 764 passed, 0 failed |
| `pnpm --filter @waggle/replay e2e` | Passed with real Chromium, ffmpeg, moved-button drift, native output, and reframed output |
| `pnpm --filter @waggle/studio e2e` | Passed against the built loopback server |
| `pnpm --filter @waggle/extension e2e` | Passed extension registration and the seam-injected capture-timeline alignment proof |
| Credential media canary | Passed real ffmpeg pixel checks and provider-byte identity checks |
| Dependency audit | No Critical, High, or Moderate advisory; one Low metadata item remained |
| Post-merge `main` checks | CI, CodeQL, and code quality passed |

Canonical evidence lives here:

- `library/requirements/backlog/prd-009-replay-engine/qa/`
- `library/requirements/backlog/prd-009-replay-engine/reports/`
- `library/requirements/backlog/prd-010-credentials-and-masking/qa/`
- `library/requirements/backlog/prd-010-credentials-and-masking/reports/`
- `EXECUTION_LEDGER.md`, rows `009-AC1` through `010-AC5`

Use the reports whose names end in `pr-review-fixes.md` for the final review state. The earlier reports are retained to document findings and remediation, not to describe the final risk state.

## Known boundaries and open risks

### Product and runtime boundaries

- `chrome.tabCapture` remains a manual boundary. The extension E2E proves registration and alignment through the controlled seam, but it does not automate the Chrome chooser or a human toolbar click. Run the headed manual flow before a release that claims real extension capture.
- The zero-terminal product direction is not complete. ADR-016 through ADR-019 require a packaged desktop Studio, extension-to-Studio discovery, encrypted provider-key storage, installer behavior, countdown and recording controls, and a GUI-primary workflow. The current CLI remains necessary for automation and PRD-012.
- The raw capture master is sensitive local material. Derived outputs are masked, but the project needs an explicit retention, deletion, and user-warning policy before external distribution.
- Studio still has a loopback-only Low finding because it lacks a per-launch token. The earlier handoff also records open hardening questions around host allowlisting, DNS rebinding, and request body limits.
- The Studio build emits existing Vite browser-compatibility warnings for `node:fs` and `node:path`. They are nonblocking today, but desktop packaging should make the server and renderer boundary explicit rather than normalize the warnings.

### Developer-experience boundaries

- The replay E2E refreshes checked-in JSON evidence in a format that can require a separate Biome formatting pass. Update the evidence writer to emit canonical formatting, or explicitly exclude generated evidence from formatting checks. Prefer fixing the writer so local and CI output stay identical.
- The regular CI workflow builds and runs the unit workspace, but it does not run every real replay, Studio, extension, or credential-media E2E. PRD-012 is the right place to decide which expensive seams become required checks and which remain scheduled or release-only checks.
- Do not infer end-to-end safety from unit totals alone. The most important credential finding survived hundreds of green tests until the real media path was audited.

## Repository governance snapshot

The live GitHub settings were refreshed on 2026-08-21. The repository has an active `main` ruleset, blocks deletion and non-fast-forward updates, requires a pull request, and enforces CodeQL High-or-higher security findings plus code-quality errors. Workflows in the repository are pinned to commit SHAs and use least-privilege permissions.

The highest-value gaps are:

| Priority | Gap | Recommended exit condition |
| --- | --- | --- |
| P0 | `.github/CODEOWNERS` has five `Unknown owner` errors because `@legioncodeinc` is not a writable user or team identity. | Replace it with a valid user or `@legioncodeinc/<team>` and enable required Code Owner review. |
| P0 | The ruleset requires zero approvals and does not require thread resolution or last-push approval. | Require at least one approval, resolved review threads, and approval of the latest meaningful push where team size permits. |
| P0 | Lint, Typecheck, and Test are not required status checks. PR #2 merged at 11:38:52 UTC while Test finished green at 11:39:06 UTC. | Add the three CI jobs as required checks so a PR cannot merge before Test completes. |
| P0 | Secret scanning push protection is disabled. | Enable push protection and document the bypass process. |
| P1 | Dependabot alerts are enabled, but Dependabot security updates are disabled. | Enable security updates and define an update-review cadence. |
| P1 | GitHub Actions allows all actions and does not enforce SHA pinning at the setting level. | Restrict allowed actions or enable organization-approved actions and SHA pinning. |
| P2 | Merge, squash, and rebase are all enabled. | Pick a primary history policy, preferably squash for feature PRs, and disable unused methods if consistency matters. |
| P2 | Community profile health is 62 percent, with no repository description or Code of Conduct detected. | Add the missing community metadata before a public launch. |

These are repository-setting changes, not application-code fixes. Handle them in a dedicated governance pass so the history and approvals remain clear.

## Recommended next steps

### Recommended default sequence

1. Harden the P0 repository settings before the next feature PR. Fix CODEOWNERS first, then require Lint, Typecheck, Test, approval, and thread resolution. Enable secret scanning push protection.
2. Build PRD-011, Vision QA and visual baselines. PRD-009 now satisfies its only blocking dependency. Start with the provider-neutral verdict schema and odiff baseline store in parallel, then merge those contracts into `waggle regen --check`, Studio review, and selector-patch approval.
3. Build PRD-012, CI regeneration, only after PRD-011 defines the check verdicts and exit codes. Extract the runner interface, add the reusable workflow, publish artifacts and summaries, and check in both a green and deliberately failing run link.
4. Author the missing desktop application PRD, expected to be PRD-018 after confirming the highest number across all requirement lifecycle folders. Resolve the Tauri-versus-Electron decision through a new ADR if the accepted ADR set still leaves it open.
5. Implement the zero-terminal path: packaged Studio, encrypted provider-key storage, extension discovery and handshake, launch or focus behavior, countdown, draggable recording control, stop flow, and automatic processing. Preserve the frozen CLI for CI and automation.
6. Continue phase 3 with PRD-013 audio-upload alignment and PRD-014 Remotion only after the Phase 2 check path is stable. Continue phase 4 with PRD-015 through PRD-017 after those dependencies are confirmed in each PRD.

### When to choose a different path

Choose the desktop path before PRD-011 if the next milestone is a user-facing demo with the explicit requirement of no terminal use. In that case, write and approve PRD-018 first, keep replay and credential contracts unchanged, and return to PRD-011 and PRD-012 before calling regeneration regression-guarded.

Choose a security-hardening sprint before either product path if Studio will be distributed, exposed beyond loopback, or used with real third-party credentials. That sprint should add per-launch authentication, host validation, bounded request bodies, a raw-capture retention policy, and a release checklist for headed `chrome.tabCapture` validation.

## Start the next worktree

The next maintainer should begin from a clean worktree rather than reusing an old agent checkout. From the repository root, use a task-specific branch and path:

```powershell
git fetch origin --prune
git worktree add -b codex/prd-011-vision-qa ..\wagglereplay-prd011 origin/main
Set-Location ..\wagglereplay-prd011
corepack enable
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
```

Before implementation, read these files in order:

1. `CLAUDE.md`
2. `EXECUTION_LEDGER.md`
3. ADR-005, ADR-008, ADR-016, ADR-017, ADR-018, and ADR-019
4. `library/requirements/backlog/prd-011-vision-qa-and-baselines/prd-011-vision-qa-and-baselines-index.md`
5. The final PRD-009 and PRD-010 security and quality reports

Run the Ship Gate in the repository-mandated order before any commit: security, quality, then repository health. Fix every Medium-or-higher finding and rerun the full gate. Stage only explicit paths and never force-push.

## Contracts that must not regress

- Never store a credential value in IR, project JSON, run reports, logs, prompts, errors, screenshots, or provider payloads.
- Resolve credential values only inside the replay action callback that uses them.
- Keep redaction geometry bounded and fail closed before creating derived images.
- Send a vision provider only PNG bytes produced and attested by the current extraction run.
- Keep all source videos and frame paths canonically confined to the project, including symlink checks.
- Keep raw capture masters local and treat them as sensitive.
- Preserve structured replay failures, selector drift notes, timing manifests, preset-specific source identity, and bounded concurrency.
- Keep `waggle regen` headless-capable. The GUI-primary direction does not remove the automation contract.
- Keep real seam tests. Mocks alone are not sufficient evidence for Chromium, ffmpeg, extension capture, filesystem confinement, or credential media redaction.
- Do not reopen accepted ADRs in a feature PR. Supersede a decision with a new ADR when the architecture genuinely changes.

End of handoff. The safest default is governance hardening, PRD-011, PRD-012, then the packaged desktop path. If the next milestone is a public no-terminal demo, move the desktop PRD ahead of PRD-011 but retain the same security and CI completion criteria.
