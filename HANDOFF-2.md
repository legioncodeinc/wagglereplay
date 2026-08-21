# HANDOFF 2: wagglereplay, after the phase 1 build and the zero-terminal pivot

Audience: the next agent, on any model or harness, picking this repository up cold. Written 2026-08-21. Read this file top to bottom before touching anything.

Precedence: Mario wins over an ADR, an ADR wins over this file, this file wins over `HANDOFF.md`. **`HANDOFF.md` (the original) is now substantially stale.** Its section 2 describes 92 uncommitted files and a `_github-seed/` folder that no longer exist. Read it only for the section 3 decision list and section 8 project history.

---

## 1. What happened in the session that produced this file

An orchestrated multi-agent run built **phase 1 of the application**, PRDs 001 through 008, from a repository that had zero application code. Then, at the end, Mario changed the product direction: **Waggle must require no terminal use at all.** Four new ADRs record that pivot. Nothing has been built against them yet.

So you are inheriting two things at once: a working phase 1, and a fresh architectural direction that phase 1 does not yet satisfy.

---

## 2. Exact current state

- Branch: `legion/handoff-application-automation-3f40ae`, 9 commits ahead of `main`, pushed.
- **Open draft PR: <https://github.com/legioncodeinc/wagglereplay/pull/1>**. All CI checks pass (Lint, Typecheck, Test, CodeQL, CodeRabbit skipped as draft). `MERGEABLE`, no conflicts.
- Repo gate green: biome clean across 329 files, 12 of 12 projects typecheck, **644 tests pass, zero skips**.
- 12 workspace packages exist and are real, not scaffolds.
- **47 of 98 acceptance criteria verified.** Phases 2, 3, and 4 (PRDs 009 through 017) are **not started**.

The single source of truth for criterion-level status is **`EXECUTION_LEDGER.md` at the repo root**. It carries the wave plan, model routing, a per-criterion status table, a watchdog log of agent incidents, a cross-cutting decisions table, and a blocked register. Read it before planning anything. Keep it updated; it is designed to survive context loss.

### What actually runs today

Verified by hand, end to end, not inferred from tests:

| Command | Verified result |
|---|---|
| `waggle init demo` | ADR-015 layout, valid manifest, credentials template with env refs only |
| `waggle record --session <dir>` | 10 steps segmented, 131 keyframes extracted by real ffmpeg |
| `waggle narrate` | 10 segments drafted, exits 7 awaiting author approval (by design) |
| `waggle render --preset 16x9` | Real H.264 MP4, 1920x1080, 30 fps, 930 KB |
| `waggle export` | Self-contained share bundle, link integrity OK, zero external references |
| `waggle studio` | Boots in about 2 seconds, HTTP 200, serves real keyframe PNGs |

There is no `bin` field, so the CLI runs as `pnpm --filter @waggle/cli start <command>`. npm publishing was an explicit PRD-001 non-goal.

The extension builds to a loadable unpacked extension and its MV3 service worker registers in real Chromium. **Nobody has ever watched it record actual video**, because `chrome.tabCapture` needs a headed browser and a human clicking the toolbar icon. See section 6.

---

## 3. The zero-terminal pivot: what Mario asked for

Verbatim intent, captured 2026-08-21:

1. Install the Chrome extension. No terminal, ever.
2. Click a button in the extension, something like "Launch Studio".
3. A page opens in the browser showing a list of recordings, with fields to enter provider API keys as needed.
4. Once that is running, tab-switch to whatever you want to record.
5. Click the extension. It shows "Record" with a record icon.
6. An on-screen countdown gives the user a moment to get ready before capture begins.
7. During recording, a small overlay sits on the left. It can be moved by dragging, and that drag must NOT register as a click in the recording. Alternatively a pop-out window, or simply clicking the extension again, stops the recording.
8. Stopping begins processing automatically.

### The constraint that forced a decision

A Chrome MV3 extension **cannot spawn a local process**. It is sandboxed: no child processes, no arbitrary filesystem access. But Studio needs Node for ffmpeg and for filesystem project directories. So the extension cannot literally launch the server.

### Mario's four decisions, now recorded as ADR-016 through ADR-019

- **Launch model:** Studio ships as a **packaged desktop app** (Tauri or Electron, evaluation deliberately left open). The user opens it once; the extension detects and connects to it. The extension button opens or focuses Studio rather than spawning it.
- **Provider API keys:** stored in an **encrypted local config file in the user's app-data directory**. Never inside a Waggle project directory, never git-committable. This is a different class of secret from ADR-008's demo-target credentials, and ADR-008 remains fully in force for those.
- **Distribution:** the desktop installer registers the extension where the platform allows it, with **sideloading as the documented fallback**.
- **CLI:** **kept but frozen.** GUI becomes the primary path. The CLI stays for automation and for PRD-012 CI regeneration, which genuinely needs a non-interactive entry point. No new CLI features.

### What this means for the existing PRDs

No PRD has been rewritten yet. **This is your first substantial decision.** At minimum:

- **PRD-005 (studio)** is built as a SvelteKit server launched by the CLI. It now needs to become the desktop app's renderer, plus gain a recordings list and an API key settings surface.
- **PRD-003 (extension)** has no record button UX, no countdown, no in-page overlay, and no Studio detection or connection handshake. All four are new work.
- A **new PRD is probably needed** for the desktop app shell, installer, and extension registration. The backlog currently stops at prd-017, so the next free number is **prd-018**. Follow `library/requirements/backlog/README.md` for the folder convention, and confirm the max across `backlog/`, `in-work/`, and `completed/` before claiming a number.
- **PRD-012 (CI regeneration)** is the reason the CLI survives. Do not let a GUI-only refactor break its headless entry point.

---

## 4. Architecture as built

Eight functional pieces. The durable artifact is the **Walkthrough IR**, a git-committable JSON document. Video is a disposable derivative of it.

```
apps/extension    Chrome MV3. Tab video via tabCapture in an offscreen
                  document, plus epoch-aligned telemetry.
                    -> events.jsonl + meta.json + video
packages/ingest   Segments events into IR steps, extracts keyframes,
                  aggregates heatmap, drafts AI descriptions.
                    -> walkthrough.v1.json, steps/, heatmap.json, predraft.json
apps/studio       Local SvelteKit 5 app. Review and describe each step.
                    -> narration/script.json
packages/narrate  Script generation, TTS adapters, word timings, captions.
                    -> audio + words.json + SRT/VTT/transcript
packages/compose  ffmpeg backend. Synthetic cursor, ripples, karaoke
                  captions, auto-zoom, branding, audio ducking -> MP4
packages/share    Render sidecars, self-contained HTML share bundle, R2 upload
packages/cli      The waggle command (now frozen per ADR-019)
packages/ir       The schema every other package depends on
fixtures/demo-app Shared deterministic test target, three variants
plugins/remotion  Placeholder for PRD-014
packages/replay   Placeholder for PRD-009, the moat
```

### The regeneration promise is not yet real

Today the compositor composites over the **original recording**. You get re-branding, new aspect ratios, new narration, new captions without re-recording. But if the target app changes, the pixels underneath are stale.

**PRD-009 (replay engine) is what closes that**, and it is unstarted. The compositor was deliberately built with a one-line seam for it: `resolveSourceVideo` in `packages/compose/src/render/render-project.ts`. Swapping in replay-sourced video should not require touching the graph builder, caption generator, cursor synthesizer, or encoder.

---

## 5. Decisions made during the build that a reviewer should know

All are recorded with fuller reasoning in `EXECUTION_LEDGER.md`.

- **Layering changed.** Project layout and manifest ownership moved from `packages/cli` down into `packages/ir`, which is now the lowest layer. The version writer repoints `currentIrVersion` atomically with the version write, so the manifest shape cannot live higher without duplicating the contract.
- **Two IR schema tightenings over upstream `@puppeteer/replay`:** unknown keys are rejected rather than stripped, and empty selector strings are rejected. ADR-001 specifies a strict superset, so these are deliberate interpretations. The argument for the unknown-key rule is that silently stripping author data inside an immutable version writer destroys data with no diff. **Still flagged for the quality gate.**
- **Three project-dir files that ADR-015 does not enumerate:** `heatmap.json`, `predraft.json`, `studio.json`. All additive, JSON, git-committable. **Whether ADR-015 needs an amendment is still open and deliberately undecided.**
- **Pre-draft descriptions live in `predraft.json`, not in the IR**, because the IR step extension schema has no description field and adding one would reopen the verified PRD-002 package.
- **Source recordings copy to `recordings/v{irVersion}/`, version-scoped.** A flat path would let a second recording overwrite the video an older immutable IR version points at.
- **The ffmpeg encoder pins `-threads`.** libx264 is deterministic only for a given thread count, and the default derives from host CPU count, so an unpinned render passes locally and fails on a differently-shaped CI runner.
- **CI pins ffmpeg 9.0.** The generated graph uses the `-/filter_complex` spelling, which ffmpeg 9 requires after removing `-filter_complex_script`. An older runner ffmpeg breaks the render path even when ffmpeg is present.
- **`packages/compose` deliberately does NOT skip when ffmpeg is absent**, unlike `packages/ingest` which does. Of 129 compose tests, 23 need ffmpeg, and those 23 are the only proof the graph is valid rather than merely deterministic. A never-skipping preflight names the required encoders and filters instead.

---

## 6. Known gaps, blockers, and open questions

### Blocked on external input (in the ledger's blocked register)

| Item | Ask |
|---|---|
| PRD-006 AC3, AC6 | An `ELEVENLABS_API_KEY`. Adapter, parsing, retry, chunk stitching are fully built and unit-tested against mocks. The live response envelope and real audio are unproven. |
| PRD-004 AC4 | Any one LLM provider key (OpenAI, Anthropic, Gemini). Adapters are complete behind an injectable transport; only the live call is unproven. |
| PRD-008 AC3 | R2 credentials. SigV4 signing is implemented and tested; that a real bucket accepts the signature is unproven. |
| PRD-003 AC8 | **A machine with a display.** `chrome.tabCapture` has never been exercised. Runbook at `apps/extension/docs/ac8-e2e-runbook.md`. |

### Open decisions for Mario

1. **R2 error logging** can surface an access key id in terminal output. The secret never leaves the process. Key ids ship in cleartext in every `Authorization` header anyway (argues Low), but CLAUDE.md and ADR-008 say no credentials in logs (argues Medium). Needs a ruling on ADR-008's scope.
2. **Studio has no upload size cap.** `BODY_SIZE_LIMIT` is `Infinity` on unauthenticated loopback write endpoints that buffer all chunks. Picking a cap is a product decision: too low breaks legitimate extension chunk uploads.
3. **DNS rebinding** defeats the SvelteKit origin check on the studio server. A `Host` allowlist in a `handle` hook would close it. Becomes more urgent once Studio is a always-installed desktop app.
4. **ADR-015 amendment** for the three new project-dir files, or an explicit ruling that its file list was illustrative.

### Repo settings still outstanding

Code Security and secret scanning are now **enabled**. Still off:
- **Secret scanning push protection.** Detects secrets after commit, does not block them at push. Highest-value remaining toggle given ADR-008.
- **Dependabot security updates**, despite `dependabot.yml` being committed.
- **Branch protection ruleset on `main`** (require PR, require CI checks, require Code Owner review, block force pushes). Never created.

---

## 7. Hard-won lessons, so you do not repeat them

These cost real time in the last session.

1. **Per-package tests passing does not mean the integration works.** `record` then `render` was completely broken behind 631 green tests, because ingest tests used a fake ffmpeg runner and compositor tests used a fixture project with the video pre-placed. Nothing exercised the handoff. **No acceptance criterion in any of the 17 PRDs covers a cross-package seam.** When you build PRD-009 and PRD-013, which have the same shape, require a real seam test explicitly.
2. **Verify on a clean checkout, not just your machine.** Two CI failures came from local state that CI did not have: ffmpeg installed by hand, and a studio build left over from development. Both passed locally for many commits.
3. **Windows-only verification hides a whole class of defect.** A test hardcoded a Windows absolute path and passed on Windows for eight commits. Worse, the guard protecting the determinism claim only checked for a Windows drive-letter pattern, so a leaked POSIX path would have passed silently on Linux.
4. **Check `git check-ignore` on build inputs.** The extension's build script lived at `apps/extension/build/build.mjs` and was silently swallowed by the root `build/` gitignore rule from creation. It was never committed. A fresh clone could never build the extension.
5. **Do not trust an empty security-alerts response as a clean scan.** Query the PR ref explicitly. The repo-level endpoint returned empty before the PR-branch analysis had uploaded, and five HIGH alerts appeared afterward.
6. **Green tests do not validate hand-rolled crypto.** The SigV4 implementation passed RFC 4231 vectors while carrying a real latent bug: the canonical request sorted headers with `localeCompare` while `SignedHeaders` used byte sort. It would have signed differently on two machines.

---

## 8. Recommended first actions

1. Read `CLAUDE.md`, then `EXECUTION_LEDGER.md`, then the four new ADRs (016 through 019), then the 15 original ADRs.
2. **Do not start PRD-009 yet.** Decide first how the zero-terminal pivot reshapes the PRD backlog, because PRD-005 and PRD-003 both change materially and PRD-009 depends on neither. If you want momentum while that settles, PRD-009 and PRD-010 are still the highest-value unstarted work and are unaffected by the pivot.
3. Run the remaining Ship Gate steps. `security-stinger` has run and its report is at `library/requirements/reports/2026-08-21-security-audit.md`. **`quality-stinger` and `github-repo-health-stinger` have not run.** CLAUDE.md requires security, then quality, then repo health, in that order.
4. Keep the PR as a draft until the ledger reads fully verified. Flip it to ready rather than opening a second PR.

## 9. Operating rules that have not changed

- Ship Gate before any commit: security, then quality, then repo health. Reports land in `library/`. Medium and above get fixed, then the whole gate re-runs.
- **Mario approves every commit.** He gave a standing exception for incremental commits on this branch during the last session, treating it as staging. Do not assume that carries over; confirm.
- Never use em dashes or en dashes in anything authored for this repo. Verify with a grep before finishing; it must return zero.
- No secrets in committed files, IR, logs, or prompts. ADR-008 governs demo-target credentials; ADR-017 governs provider API keys.
- Never copy source from CapSoftware/Cap. Clean-room reimplementation of concepts only.
- No destructive git operations, no force-push.
- `library/notes/` is human-only. Never read, write, or cite it.
