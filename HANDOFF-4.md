# HANDOFF 4: the production playbook

Audience: any AI agent or human maintainer picking up Waggle cold with the goal of driving it to production-complete in the shortest possible time. Written 2026-08-21 against `main` HEAD `92a8658` (all four PRs merged, no open PRs, no remote branches besides `origin/main`).

Precedence: Mario wins over an ADR, an ADR wins over this file, this file wins over `HANDOFF-3.md`, which wins over `HANDOFF-2.md`, which wins over `HANDOFF.md`. Do not delete the older handoffs: HANDOFF.md sections 3 and 8 are the only record of the early ADR summary and session history, and HANDOFF-2 section 3 is the only verbatim record of Mario's zero-terminal intent.

Provenance: every claim in this file was verified in this cycle by a 16-agent audit swarm (4 ADR lanes, 8 PRD lanes, 2 handoff verification lanes, 1 live build-health lane, 1 completeness critic) plus live `gh api` checks against the GitHub repository. The full findings report is at `library/requirements/reports/handoff-4/2026-08-21-qa-report.md`. Where this file disagrees with an older document, this file is the one that was checked.

---

## 1. Sixty-second orientation

Waggle records a web-app walkthrough once (Chrome MV3 extension: pixels plus click/route/element telemetry), stores it as a git-committable Walkthrough IR, and regenerates narrated demo videos from it at any aspect ratio via Playwright replay plus ffmpeg composition. AGPL-3.0, personal-first, local-first, no database, no cloud dependency. The IR is the durable artifact; video is a disposable derivative.

What exists and works, verified end to end: the full capture-to-render pipeline (PRDs 001 through 008) and the two moat PRDs, replay regeneration and credential masking (PRDs 009 and 010). 764 unit tests, clean typecheck across 12 workspace projects, real-Chromium and real-ffmpeg E2E suites, three security review cycles behind the credential path.

What does not exist yet: the zero-terminal desktop product (PRD-018, Electron, fully planned and 100 percent unbuilt), the regression moat around regeneration (PRD-011 vision QA, PRD-012 CI regeneration), phases 3 and 4 (PRDs 013 through 017), all release engineering (zero tags, zero releases, no release workflow, no checksums), all user-facing documentation, and a Chrome Web Store listing that the zero-terminal promise turns out to depend on.

The single most important thing to understand: **the code is green, the plan is red.** This cycle's audit found zero code regressions but seven Critical planning defects that would send a builder into a wall. Fix the plan first (section 5), clear Mario's decision queue (section 4), then build (section 8). Almost everything blocking production is a documentation edit or a decision, not hard engineering.

---

## 2. Ground truth: current state

Verified this cycle, not inherited from older documents.

| Item | Verified value |
| --- | --- |
| Default branch | `main`, HEAD `92a8658` (PR #4 merge). PRs #1 through #4 all MERGED, none open |
| Ledger acceptance criteria | 98 rows in `EXECUTION_LEDGER.md`: 59 VERIFIED, 5 DONE, 34 OPEN. PRDs 001 through 010 complete (64 of 98). PRD-018's 8 module criteria plus 67 sub-criteria are NOT in the ledger at all |
| ADRs | 20 accepted, ADR-001 through ADR-020. Mutually consistent, no ADR contradicts another or the shipped code. Four backlog PRDs conflict with ADR-019 and ADR-017 (see section 3) |
| Build health (this Windows worktree) | `pnpm install --frozen-lockfile` clean; typecheck clean (0 errors, Svelte 604 files 0 warnings); 764 tests, 759 pass; the 5 failures and all 378 lint errors are environmental (CRLF checkout artifacts from `core.autocrlf=true` with no `.gitattributes`, plus 2 CLI tests that need a built Studio). Zero code regressions against the HANDOFF-3 baseline |
| Independent re-verification | packages/replay suite re-run: 63 of 63 pass. Real-ffmpeg credential canary re-run: pass, marked pixels black, provider bytes attested |
| Security state | 0 Critical, 0 High, 0 Medium, 1 Low open (Studio loopback has no per-launch token; prd-018b owns closing it). All application-level findings from the three PRD-009/010 review cycles remain fixed |
| Governance (live gh api) | Of HANDOFF-3's eight gaps, one closed (CODEOWNERS now valid, owner `@thenotoriousllama`, errors endpoint returns empty). Seven open: ruleset id 21133581 requires 0 approvals, no code-owner review, no thread resolution, no last-push approval, no required status checks of any kind; secret scanning push protection disabled; Dependabot security updates disabled; Actions allows all actions with `sha_pinning_required: false`; merge, squash, and rebase all enabled; repo description null; community health 62 percent; private vulnerability reporting disabled while SECURITY.md names it as the primary reporting channel |
| Release engineering | Zero git tags, zero GitHub releases, all 10 workspace packages at 0.1.0 and `private: true` with no license field, CHANGELOG has only an Unreleased section, no release workflow exists |
| Blocked on external input | ELEVENLABS_API_KEY (006-AC3/AC6), any LLM key (004-AC4), R2 credentials (008-AC3), a headed-display machine for real `chrome.tabCapture` (003-AC8). Unchanged since HANDOFF-2 |

Environment facts: Node v25.2.1, pnpm 11.9.0, ffmpeg 9.0 (gyan.dev full build, a GPL configuration, which matters in section 4), Playwright Chromium cached. Repo requires Node >= 24.

---

## 3. Corrections: where the existing documents are wrong

Read these before trusting any older document. Each was verified against code this cycle.

1. **`waggle regen --check` does not exist in code**, anywhere. Three sources disagree about who builds it: `packages/cli/src/commands/regen.ts:17-19` says prd-012 adds it; `prd-012`'s own dependency line says prd-011 provides the check gates; HANDOFF-3 says build prd-011 first so it defines the verdicts and exit codes; the ledger schedules 011 and 012 in the same wave with no ordering. ADR-019 names only prd-012 in its carve-out. Do not dispatch PRD-011 or PRD-012 until Mario rules on ownership (decision queue item 5).
2. **HANDOFF-3 line 52 is false as written.** It claims no executable-source construction remains in the replay path, but `packages/replay/src/steps/act.ts:248-251` passes an IR-supplied `waitForExpression` string to `page.waitForFunction`. This is arguably legitimate ADR-001 schema inheritance, but the IR is a shareable file, so state the trust assumption instead of denying the surface. Expect CodeQL to flag it eventually.
3. **A QA report cites a test that does not exist.** `prd-010`'s post-redaction QA report cites `packages/replay/test/index.test.ts:4-41` as proof the plaintext credential resolver is absent from the public barrel. That file contains only preset-registry tests. The code IS correct (`packages/replay/src/credentials/index.ts` omits `createCredentialBindings`), but no test guards it. See section 6 item 1.
4. **The checked-in reframed replay evidence bypasses the mechanism it evidences.** The only reframed manifest in prd-009's qa/ was produced by `forceReframed: true`, which returns at `reflow-probe.ts:74` before any measurement. The reflow probe itself (four decision branches) has zero tests.
5. **README.md and CONTRIBUTING.md are three phases stale.** README still calls every command past `init` a stub, says `record` opens the Studio, and cites 17 PRDs. CONTRIBUTING calls the repo a seeded planning library. PRDs 001 through 010 are merged. The public repo is the entire distribution strategy, so this is the highest-leverage stale artifact in the project.
6. **The extension AC8 runbook is stale.** `apps/extension/docs/ac8-e2e-runbook.md` step 9 says uploads will fail because no Studio server exists; Studio has since shipped, so a verifier today sees successful uploads.
7. **HANDOFF-2 section 2 is stale on every load-bearing number** (PR #1 merged, 64 of 98 ACs done not 47, phase 2 half-complete). Its section 3 pivot record, section 6 blocked items, and section 7 lessons remain accurate.
8. **The ledger's own header is stale**: names a deleted branch, says 17 PRDs and 98 criteria while 18 PRD folders exist, and has no Run 3 header for the ADR-020/prd-018/CODEOWNERS PR.
9. **"Twenty ADRs, no contradictions" needs its scope attached.** ADR versus ADR and ADR versus shipped code: consistent. ADR versus backlog PRD: four conflicts. PRD-013 AC1's new `narrate --audio` CLI flag, PRD-016 AC2's yolo flag, and PRD-017 AC4's confirm flag all violate ADR-019's CLI freeze (all three PRDs predate ADR-019 by one day and never cite it). ADR-017 is missing from the governing lists of PRDs 011, 015, 016, and 017, and does not name the new key classes phase 4 introduces (explorer LLM key, STT key, HeyGen/Tavus).
10. **The VERIFIED grade in the ledger has a caveat.** The Run 2 harness had no sub-agent spawn tool, so the orchestrator executed and graded its own work; real independent checks did occur (PR review, CodeQL, three audit passes, post-merge CI, and this cycle's re-runs), so no row is being downgraded, but do not cite the ledger as proof of independent verification.
11. **Em/en dash violations exist inside locked artifacts**: exactly 150, all in the newest files (143 across the eight prd-018 files, 7 in ADR-020). Everything older is clean. CLAUDE.md makes this a non-negotiable; fix in Wave 0.

---

## 4. The decision queue for Mario

Every one of these serializes behind one person, and most block a wave somewhere downstream. The audit's strongest recommendation: **clear this list in one sitting.** Items are ordered by how much they unblock.

1. **Provider keys** (unblocks 006-AC3, 006-AC6, 004-AC4, 008-AC3 now; later every live-call AC in PRDs 011, 013, 015, 016, 017): supply `ELEVENLABS_API_KEY`, one LLM key (OpenAI or Anthropic) plus `WAGGLE_PREDRAFT_PROVIDER`, and R2 credentials (account id, access key id, secret, bucket). HeyGen or Tavus can wait for phase 4.
2. **Headed capture validation** (003-AC8, and a prerequisite for any release claiming real extension capture): run `apps/extension/docs/ac8-e2e-runbook.md` on a machine with a display (refresh its stale step 9 first, section 5 item 8).
3. **Chrome Web Store submission** (the long pole under PRD-018 AC8): approve starting the listing now. Off-store install is not generally available on Windows or macOS, so the store is the only real path to a clean-machine install. The permission set (tabCapture, webRequest, all-origins host permissions) draws manual review that requires a hosted privacy policy URL, a single-purpose declaration, and per-permission justifications (`apps/extension/docs/permissions-justification.md` is the seed). Also decide whether the store listing id or a fixed manifest `key` defines the packed extension id prd-018b's origin allowlist depends on.
4. **Repository settings** (fifteen minutes in the GitHub UI): raise ruleset required approvals to at least 1, enable code-owner review, thread resolution, and required status checks (Lint, Typecheck, Test, CodeQL); enable secret scanning push protection; enable Dependabot security updates; enable private vulnerability reporting (SECURITY.md currently points reporters at a dead endpoint); restrict Actions or require SHA pinning; pick one merge method (squash recommended); add a repo description and a Code of Conduct.
5. **`--check` ownership ruling** (blocks PRDs 011 and 012): recommended ruling per HANDOFF-3's logic: prd-011 defines and implements the check verdicts, exit codes, and the `--check` flag; prd-012 consumes it in CI; amend `regen.ts`'s comment, prd-012's dependency line, and add an ADR-019 interaction note naming prd-011.
6. **ADR-019 conflicts in PRDs 013, 016, 017** (blocks phase 3/4 dispatch): rule each one: rewrite as Studio UI or env-var guardrails (shipped precedent: `WAGGLE_ALLOW_UNLICENSED_AUDIO`), or amend ADR-019 with explicit carve-outs.
7. **ADR-015 file-list ruling** (open since ledger W4, the oldest unresolved item): declare the list illustrative, or amend to enumerate `heatmap.json`, `predraft.json`, `studio.json`, and `recordings/`. Blocks any PRD that adds project-dir state (011, 015, 016 all will).
8. **R2 error-logging severity** (open since HANDOFF-2): does ADR-008's no-credentials-in-logs rule cover access key ids in an R2 error body echo (Medium, redact it) or only secrets (Low, accept it)?
9. **Electron major pin** (ADR-020 requires the implementing PRD to pin it; prd-018a currently defers): pick the major, verify its embedded Node meets the >= 24 floor, record it in prd-018a.
10. **Linux support answer** (resolves real scope in two sub-PRDs): if Linux stays a from-source build with no desktop artifact, ADR-017's headless-Linux key-file fallback does not need to be built and prd-018c shrinks; if supported, prd-018g needs a Linux artifact and CI job. One sentence either way.
11. **Versioning and first release**: single repo version (recommended, all packages are private) or per-package; whether npm publication ever happens; the first tag (0.1.0 recommended, converting CHANGELOG's Unreleased section).
12. **ffmpeg bundle choice and third-party notices**: prd-018g bundles ffmpeg into the installer, which makes Waggle its distributor. The dev machine's build is GPL-configured. Choose the build (LGPL vs GPL configuration), and approve authoring a THIRD-PARTY/NOTICE inventory plus a restatement of ADR-003's H.264 patent stance for the bundled case.
13. **AGPL section 13 ruling** (one paragraph): state whether the network-interaction clause obligations for the ADR-004 cloud runner profile and the Studio `--host` escape hatch run to the deploying user rather than Legion Code Inc. Cheap now, expensive the day an organization runs the cloud profile.

---

## 5. Wave 0: fix the plan before building anything

All documentation edits. No code. Everything here was a Critical or Warning in this cycle's audit; the goal is that the next builder can trust what they read. Estimated one focused session.

1. **Resolve `--check` ownership** per Mario's ruling (decision 5): amend prd-011 AC3 or prd-012, fix `packages/cli/src/commands/regen.ts:17-19`'s comment, add the ADR-019 interaction note.
2. **Amend PRD-013 AC1, PRD-016 AC2, PRD-017 AC4** per Mario's ruling (decision 6), and add ADR-019 plus ADR-017 to the governing-ADR lines of PRDs 011, 012, 013, 015, 016, 017.
3. **Record the ADR-015 ruling** (decision 7) as an amendment note or a short superseding ADR.
4. **Strip the 150 em/en dashes** from the eight prd-018 files and ADR-020.
5. **Refresh `EXECUTION_LEDGER.md`**: Run 3 header for the docs PR, Run 4 header for this cycle, 018-AC1 through 018-AC8 rows (OPEN), scope line 17 to 18 PRDs, remove the dead branch reference, and mark the CodeQL-upload blocked-register row resolved. Update CLAUDE.md's "17-PRD build plan" and "no code yet" lines while there.
6. **Move shipped PRDs to `completed/`**: PRDs 001 through 010, per `library/requirements/README.md`'s lifecycle-equals-location rule, updating their Status headers. This makes dependency checks trustworthy from folder location alone.
7. **Rewrite README.md and CONTRIBUTING.md** against merged reality (commands are real, 18 PRDs, extension flow is the human path per ADR-019, `record` ingests a session). Update `waggle record`'s help text to say the extension flow is the recommended human path (ADR-019's own consequence, currently unowned).
8. **Refresh `apps/extension/docs/ac8-e2e-runbook.md`** step 9 for the now-real Studio server.
9. **Amend PRD-018** (the largest single item, all edits to prd-018 files):
   - Author the missing sub-PRD(s) for the three unowned AC8 prerequisites: zero-terminal project creation/selection (replacing the `WAGGLE_PROJECT_DIR`-at-boot contract in `apps/studio/src/lib/server/project-context.ts:40-57` with a main-process-supplied, switchable project dir plus first-run creation), and authenticated GUI narrate/render/regen triggers with progress surfacing (Studio routes invoking `@waggle/narrate` and `@waggle/compose`; this adds Studio surface, not CLI surface, so ADR-019 is untouched).
   - Own extension delivery: the manifest `key` field for a fixed packed id, a packed artifact in the prd-018g build, and the store-vs-documented-sideload decision (decision 3).
   - prd-018b: change "narrow the health endpoint" to "create it" (no health route exists on main); claim the focus route and specify the main-process injection seam; extend Files Touched to `packages/cli/src/commands/studio.ts:73` and `apps/studio/test/e2e/run-studio-smoke.ts:169` (the two `BODY_SIZE_LIMIT: 'Infinity'` sites) and `apps/extension/src/lib/upload-client.ts` (where the fetches that must carry the token live); size the body cap per MediaRecorder chunk (default 1000 ms), not per recording; add a forged-Origin local-process test and state the residual local-process risk; pin the loopback port at 4310 (the extension hardcodes it) or add discovery.
   - prd-018a: pin the Electron major (decision 9); add navigation-denial, IPC sender-validation, webviewTag-off, and packaged-devtools ACs; name adapter-node's `build/handler.js` importable entry.
   - prd-018c: extend to pre-draft LLM keys (`packages/ingest/src/predraft/env-config.ts:28-30`, injected via `runIngest`'s `predraftEnv`) and R2 keys in packages/share; consider implementing KeySource as the injectable env record all three packages already accept.
   - prd-018d: add an AC for the post-delete state of an IR version whose `sourceRecording.videoRef` no longer resolves; replace the nonexistent "session manifest" enumeration source with the real `recordings/v{n}/` and `steps/v{n}/` subtrees; reconcile the multi-project rows with the single-project server.
   - prd-018f: name the owner of the live-progress channel (ingest currently runs synchronously inside the meta.json POST; the `api/watch` SSE surface is the natural home); note the documentPictureInPicture user-gesture constraint and countdown-as-mitigation.
   - prd-018g: add an AC asserting no auto-updater ships and the manual update path is documented; add SHA-256 checksum publication; resolve the tagged-push question standalone instead of deferring to unbuilt PRD-012.
   - Module level: add the `## 0. Dependencies` section, create the `qa/` folder, add a CLI/CI regression AC (studio smoke harness passes with the token; `waggle regen` stays headless), and record ADR-018's pause deferral properly (follow-up ADR note, since sub-PRD scope notes cannot amend an accepted ADR).
10. **Assign an owner to the raw-capture retention policy** (a small PRD or release-checklist item) including the user-facing sentence: a raw capture master is a video of everything on screen and can contain unmarked credentials and visible customer data; deletion is irreversible because the IR cannot regenerate it. Note this is a disk-and-distribution concern only; `waggle init` already gitignores `recordings/`.
11. **PRD-011 precision fixes** (before its dispatch): name the intent-text source (narration `approvedText` by stepIndex with a generated fallback for unnarrated steps, or a new field); define the "IR patch draft" format and home (and whether a `patches/` dir joins PROJECT_SUBDIRS, which feeds decision 7); make the QA-skip an env var; name `createSensitiveTextScrubber` from `@waggle/ir` explicitly in AC1; and decide the replay-screenshot attestation analogue (PRD-010's extractor-attestation contract has no equivalent on the path PRD-011 opens to a vision provider).
12. **PRD-013 precision fixes**: decide where per-word confidence lives (the shared words.json schema is strictObject and shared with verified consumers; a sidecar avoids the version bump); scope the WhisperX runner (Python/PyTorch process model) with ADR-004-style rigor.

---

## 6. Wave 0.5: the guardrail code pass

Small, high-value, no product behavior changes. Can run parallel to Wave 0. Each item closes a gap where a shipped contract has no regression protection.

1. **Barrel regression test**: assert the public `@waggle/replay` export surface does not contain `createCredentialBindings` (the single cheapest guard for the highest-value PRD-010 contract). Correct the false citation in prd-010's post-redaction QA report in the same commit.
2. **Reflow probe unit tests**: cover the horizontal-overflow branch (tolerance 8 px), empty-body branch, and navigation-failure branch of `packages/replay/src/presets/reflow-probe.ts`, plus `capturePresetFor`'s reframed-to-master mapping. Regenerate one qa/ reframed artifact from a genuine probe decision instead of `forceReframed`.
3. **Replay-side credential pixel proof**: add a credential change step to `fixtures/demo-app` and the replay E2E, then assert with real ffmpeg that the field region is black in the captured MP4 and the per-step PNG. This is the replay-path analogue of the ingest canary and is what HANDOFF-3's own "mocks are not sufficient evidence" rule demands.
4. **Canary ffmpeg resolution**: make `packages/ingest/test/pipeline/credential-redaction.integration.test.ts` resolve ffmpeg via `resolveFfmpegPath`/`WAGGLE_FFMPEG_PATH` like production instead of bare `ffmpeg`. Keep the no-skip behavior exactly as is.
5. **`.gitattributes`**: add `* text=auto eol=lf`. This single file eliminates the entire class of CRLF false failures observed this cycle (378 lint errors, 3 golden-file test failures on a Windows checkout).
6. **Dead surface cleanup in packages/replay**: the never-constructed `StepFailure` class with its false constructor-scrubbing doc comment, the ignored `SettleOptions.networkExclusions` parameter, and the never-invoked `ActContext.onUnsupported`. Delete or wire up; each currently reads as working configuration.
7. **Shared privacy helper**: extract the duplicated `credentialEnvNames`/`flaggedPlaceholders` logic from `packages/ingest/src/predraft/privacy.ts` and `packages/narrate/src/privacy/project-text.ts` before PRD-011 creates a third copy.
8. **License headers**: add `SPDX-License-Identifier: AGPL-3.0-or-later` to all 344 TS/Svelte source files and a license field to every package.json, enforced by a lint/CI rule. Mechanical now, painful after external contributions.
9. **Correct HANDOFF-3 line 52** (or note it superseded by this file's section 3 item 2).

---

## 7. CI and release engineering

The decision the corpus kept pointing at, stated concretely. Land the required-checks change together with the ruleset strengthening (decision 4), since a required check is meaningless while the ruleset requires nothing.

**Required on every PR**: Lint, Typecheck, Test, CodeQL. All exist today and run in minutes; none is currently required, which is how PR #2 merged 14 seconds before its Test job finished.

**Scheduled nightly plus required on release tags**: the replay, Studio, and extension E2E suites (`pnpm --filter @waggle/replay e2e`, `--filter @waggle/studio e2e`, `--filter @waggle/extension e2e`). These need a Playwright browser install step that no workflow currently has. This decision belongs to PRD-012's scope; add it there as an explicit AC (no current PRD-012 AC covers repository E2Es, so HANDOFF-3's pointer currently lands nowhere).

**Manual with recorded evidence**: the headed `chrome.tabCapture` pass and the clean-machine zero-terminal pass (PRD-018 AC8).

**Leave alone**: the real-ffmpeg credential canary already runs in CI as a plain Vitest test with no skip guard. That is the pattern to copy, not change.

**Add OS coverage**: Windows and macOS CI jobs. The product ships installers for exactly those two platforms and no workflow has ever run on either; the primary dev machine is Windows.

**Release workflow** (before prd-018g ships anything): tag-triggered; builds the unsigned Windows and macOS artifacts; publishes a SHA-256 per artifact plus a documented verification command (the only integrity signal an unsigned build can offer, and the install copy is otherwise training users to click through the one warning they get); generates release notes from Conventional Commits; converts CHANGELOG's Unreleased into the tagged section. Ship a THIRD-PARTY/NOTICE file naming the bundled ffmpeg build and Chromium (decision 12).

---

## 8. The build roadmap to production

Three tracks. A and B are independent and can run in parallel if capacity allows; C is background work that must finish before the first installer ships. If forced to serialize, the order below optimizes for a shippable product (production, per Mario's direction) while keeping the regression moat close behind.

### Track A: PRD-018, the zero-terminal desktop product (P0, XL)

Prerequisites: Wave 0 item 9 (the PRD-018 amendments), decisions 3, 9, 10. Store submission (decision 3) starts immediately because its latency is third-party controlled.

Revised wave order (supersedes the index's four-wave table; rationale in the audit report):

| Wave | Content | Why |
| --- | --- | --- |
| A0 | The Wave 0 amendments: Electron major pinned, health endpoint owned as create-not-narrow, focus route claimed, port pinned, project-lifecycle and GUI-trigger sub-PRD(s) authored, extension delivery assigned | Every one is a contradiction or orphan that otherwise surfaces in wave 3 or 4, after a through f are built on it |
| A1 | prd-018a alone (Electron shell, hardened renderer, main-process server hosting) | Blocks everything; every other sub-PRD runs inside its shell and preload bridge |
| A2 | prd-018b alone (per-launch token, host validation, body caps, health endpoint, focus route) | Every renderer and extension call in c through f rides its token; keep the handshake under one adversarial review before three consumers depend on it |
| A3 | prd-018c, prd-018d, prd-018e in parallel (keys, recordings list, handshake) | All three declare only a and b as blockers; pulling e forward (versus the index's wave 3) shortens the path to f by a full wave |
| A4 | prd-018f (countdown, capture-excluded control, converged stop, auto-processing with live progress) plus the new project-lifecycle and GUI-trigger sub-PRD(s) | f is the largest sub-PRD and consumes e; the GUI triggers are AC8 prerequisites |
| A5 | prd-018g (unsigned packaging, checksums, install copy, extension packing) plus module AC8 clean-machine evidence | AC8 additionally requires the A0 amendments and the store listing (or the documented interim sideload) |

Sequencing note: prd-018b should land before PRD-011 AC4's Studio review surface regardless of track interleaving, so PRD-011 inherits authenticated routes instead of retrofitting them.

### Track B: the regression moat (PRD-011 then PRD-012)

Prerequisites: decision 5 (`--check` ownership), Wave 0 item 11 (PRD-011 precision fixes).

1. PRD-011 vision QA and baselines: provider-neutral verdict adapter (copy the `provider-selection.ts` env-adapter pattern; the shared scrubber is `createSensitiveTextScrubber` from `@waggle/ir`), odiff baseline store (`baselines/` is already scaffolded and git-tracked; odiff is a new dependency, none exists yet), `--check` exit codes (extend `exit-codes.ts`, highest today is 25) and RunReport verdict/diff fields with a schema version bump, Studio review surface (mirror the existing store plus routes/api pattern), self-heal patch drafts (StepFailureDetail already carries `attemptedSelectors` and was written for this), cost guard (corpus has the constants: roughly $0.0002 per verdict, a 30-step walkthrough under two cents).
2. PRD-012 CI regeneration: runner interface (mostly a formalization; `runRegen` already takes injectable env and browser and defaults headless), reusable `waggle-regen.yml` with Playwright browser caching, trigger matrix with a green and a deliberately failing run link, Cloudflare Containers stub and runbook. Fold in the required-checks AC from section 7.

### Track C: release, compliance, docs (background, must finish before first installer)

Release workflow and first tag (section 7, decisions 11 and 12), license headers and NOTICE (section 6 item 8, decision 12), AGPL section 13 ruling (decision 13), README/CONTRIBUTING rewrite (Wave 0 item 7), a `docs/` set for the zero-terminal audience (per-OS install guide including the expected SmartScreen/Gatekeeper warnings and checksum verification, first-walkthrough tutorial, what the IR is and why the project dir belongs in git, replay-drift troubleshooting), a support matrix (OS, Chrome floor 116, ffmpeg floor, the Linux answer from decision 10), the retention policy (Wave 0 item 10), and SECURITY.md's channel made live (decision 4).

### Then: phases 3 and 4

PRD-013 (after its AC1 and confidence-field rulings) and PRD-014 are independent of each other; PRD-014 is the cleanest unbuilt PRD in the backlog (the compositor interface and brand-kit schema were written anticipating it; the conformance harness is honest new work). PRD-015 needs PRD-011; PRD-016 needs PRD-013 and PRD-015 plus its missing cost-guard AC; PRD-017 needs its provider key and is correctly gated by ADR-007. All phase-4 live-call ACs will park BLOCKED without keys, per the established adapter-plus-mock pattern.

---

## 9. Production release checklist (definition of done for the first public release)

Gate every release claim against this list. It merges HANDOFF-3's boundaries with this cycle's findings.

- [ ] All PRD-018 module ACs verified, including AC8's clean-machine zero-terminal evidence in `prd-018-desktop-application/qa/`
- [ ] Headed `chrome.tabCapture` manual validation recorded (003-AC8 closed)
- [ ] Studio Low finding closed: per-launch token, host validation, bounded bodies (prd-018b), verified by the token-rejection test output
- [ ] Replay-side credential pixel canary green (section 6 item 3) alongside the ingest canary
- [ ] PRD-011 and PRD-012 shipped, `regen --check` green on the fixture and a deliberately failing case linked (regeneration is the product's moat; do not ship a regeneration product without regression-guarding regeneration)
- [ ] Required checks and ruleset enforced (section 7); no PR can merge before Test completes
- [ ] Tagged release with checksummed unsigned artifacts, release notes, and honest install copy naming the publisher, the expected OS warnings, the override steps, and the manual update path
- [ ] THIRD-PARTY/NOTICE shipped; ffmpeg build choice recorded; license headers in place; AGPL section 13 ruling recorded
- [ ] README, CONTRIBUTING, docs/, support matrix, retention policy, and privacy policy (store requirement) published and current
- [ ] Chrome Web Store listing live, or the interim install path documented honestly in the install copy
- [ ] Provider keys entered through the encrypted store on the GUI path; env-ref path proven unchanged for CI (prd-018c AC-18c.2.2)
- [ ] Ship Gate (security-stinger, quality-stinger, github-repo-health-stinger, in that order) green on the release tree with all Medium-plus findings fixed

---

## 10. Contracts that must not regress

Carried forward from HANDOFF-3 with this cycle's corrections and additions. These are verified-in-source today; the parenthetical names the guard or its gap.

1. Never store a credential value in IR, project JSON, run reports, logs, prompts, errors, screenshots, or provider payloads (canary battery; extension masking returns a fixed `[REDACTED]` with no length signal).
2. Resolve credential values only inside the replay action callback (`actWithValue`); the public `@waggle/replay` barrel must never export `createCredentialBindings` (correct today; test missing until section 6 item 1 lands).
3. Keep redaction geometry bounded and fail closed before any derived image is created (validated at three layers; drawbox projected with decoded-frame iw/ih).
4. Send a vision provider only PNG bytes attested by the current extraction run (empty allowlist blocks everything by default). Extend this contract, not a new one, to replay screenshots before PRD-011 ships.
5. Keep all source video and frame paths canonically confined to the project, symlink checks included (three packages).
6. Keep raw capture masters local, gitignored, and treated as sensitive; the retention policy gates external distribution.
7. Preserve structured step failures, selector-drift notes, timing manifests, preset-scoped source identity, and strict `WAGGLE_RENDER_CONCURRENCY` parsing.
8. Keep `waggle regen` headless-capable and the CLI surface frozen per ADR-019; every new interactive capability ships through the extension or Studio. The CLI/CI path resolves provider keys from env refs, never the encrypted store.
9. Keep real seam tests; mocks are not sufficient evidence for Chromium, ffmpeg, extension capture, filesystem confinement, or credential media redaction. The `waitForExpression` surface in the replay path is an accepted, documented ADR-001 inheritance with a stated trust assumption, not a denied one.
10. Do not reopen accepted ADRs in a feature PR; supersede via a new ADR. That includes deferrals: dropping a decided element (like ADR-018's pause control) requires an ADR note, not a sub-PRD scope line.
11. IR versions are immutable; edits create new versions; the manifest pointer moves atomically. No database, ever (ADR-015).
12. No billing, tenancy, metering, or white-label plumbing anywhere (ADR-012); no cloud dependency in the core loop (ADR-014); clean-room only with respect to Cap (never copy AGPL source in).

---

## 11. Blocked register (external inputs)

| Item | Blocks | Ask |
| --- | --- | --- |
| ELEVENLABS_API_KEY | 006-AC3, 006-AC6 to VERIFIED; later 013, 016 | Env var, one live synthesis to confirm the response envelope |
| LLM key (OpenAI or Anthropic) | 004-AC4 to VERIFIED; later 011, 015, 016 | Env var plus `WAGGLE_PREDRAFT_PROVIDER` |
| R2 credentials | 008-AC3 to VERIFIED | Account id, key id, secret, bucket; one live upload |
| Headed display machine | 003-AC8; PRD-018 AC8 | Run the (refreshed) runbook once |
| Chrome Web Store review | Extension delivery; PRD-018 AC8 | Start listing now; privacy policy URL and permission justifications required |
| HeyGen or Tavus key | 017-AC1 live half | Phase 4 only |

---

## 12. Environment and first commands

Start from a clean worktree off `origin/main`. On Windows, set line endings before installing so lint and golden tests match CI (until section 6 item 5 lands a `.gitattributes`, this is manual):

```powershell
git fetch origin --prune
git worktree add -b legion/<task-slug> ..\wagglereplay-<task> origin/main
Set-Location ..\wagglereplay-<task>
git config core.autocrlf false
git rm -r --cached . ; git checkout .
corepack enable
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

Expected when healthy: lint clean across 380 files, typecheck clean, 764 tests passing (the 2 `waggle studio` CLI tests require `pnpm build` first; CI builds before its own Test job). The E2E suites are separate: `pnpm --filter @waggle/replay e2e` (real Chromium plus ffmpeg), `--filter @waggle/studio e2e` (built loopback server), `--filter @waggle/extension e2e` (registration and alignment seam).

Read in this order before any implementation: `CLAUDE.md`, this file, `EXECUTION_LEDGER.md` (with section 3's caveats), the governing ADRs for your PRD, the PRD index and sub-PRDs, then the relevant final QA and security reports (`pr-review-fixes` variants are the final state for PRD-009/010).

---

## 13. Operating rules (unchanged, restated)

- Ship Gate before ANY commit, in this exact order: security-stinger, then quality-stinger, then github-repo-health-stinger. Reports land in `library/`. Medium-plus findings get fixed, then the full gate re-runs.
- Mario approves every commit; never `git commit` or `git push` without his explicit go-ahead. No destructive git, no force-push. Stage explicit paths.
- Never use em dashes or en dashes in any authored file, doc, or message; grep before finishing, it must return zero (Biome does not lint Markdown; a clean `pnpm lint` says nothing about prose).
- No secrets anywhere in project files, IR, logs, or prompts. ADR-008 governs demo-target credentials; ADR-017 governs provider keys.
- `library/notes/` is human-only. Never read, write, or cite it.
- Decompose to agent tasks of 10 minutes or less, mapped to PRD acceptance criteria; the PRD index wave tables are the dispatch plan.
- Verify on a clean checkout; do not trust green unit totals as end-to-end proof (the most important credential finding in this project's history survived hundreds of green tests); query PR-ref security alerts explicitly; check `git check-ignore` on build inputs.

End of handoff. The fastest path to production: clear the decision queue in one sitting, run Wave 0 and the guardrail pass, start the store submission and release plumbing immediately, then build PRD-018 on the revised wave order with PRD-011/012 close behind. Everything a builder needs to not repeat this cycle's archaeology is above.
