# PRD-018g: Unsigned packaging, engine floor, resources, and install copy

> **Waggle** - sub-feature PRD of [PRD-018](./prd-018-desktop-application-index.md)
>
> **Status:** Draft
> **Priority:** P1
> **Effort:** L

## Phase Overview

### Goals

Turn the desktop shell into distributable unsigned installers per ADR-020: Windows installer and macOS disk image built without signing ceremony, with a build-time check that the pinned Electron major's embedded Node satisfies the Node 24+ engine floor, a delivered-by-design strategy for Playwright's Chromium and ffmpeg, and install documentation that states the expected OS warning, the publisher, and the override steps per platform. Also produces the zero-terminal module-level acceptance evidence (module AC8).

### Scope

- electron-builder configuration: NSIS (Windows) and dmg (macOS) targets, asar packaging, `waggle://` protocol declaration (sub-PRD e), app icons, versioned artifact names.
- Signing explicitly disabled with a comment pointing at ADR-020; a config seam (env-gated) so enabling the existing certificate later is a pipeline change, not a code change.
- No auto-updater ships: electron-builder's publish/auto-update machinery stays off, asserted by a config check (no `publish` provider wired, no update-check code in main); the manual update path (download the next installer, install over) is documented in the install copy.
- SHA-256 checksum publication: every release artifact gets a published checksum (release-notes body and/or a `checksums.txt` artifact) plus a documented verification command per platform - the only integrity signal an unsigned build can offer.
- Engine-floor build check: fail `dist` if `process.versions.node` of the pinned Electron (major 43) is below the repo's floor.
- Resource strategy for Playwright Chromium and ffmpeg: bundled as app resources, or a documented first-run download - decided here, delivered here. The bundled ffmpeg build's license configuration is recorded in THIRD-PARTY/NOTICE (Mario's 2026-08-12 decision queue item; LGPL-configured build recommended to minimize bundling obligations - final say recorded when g dispatches).
- Extension packing: the build also produces the packed extension artifact (`.zip`) with the fixed manifest `key` (the index's extension-delivery ownership), for store upload or documented sideload.
- Install and override documentation per platform; publisher identity stated.
- The clean-machine zero-terminal pass (module AC8) executed and recorded.
- Tagged-push CI builds: decided here, standalone (2026-08-21; the original open question deferred this to unbuilt prd-012, which was backwards): tagged pushes build both installers plus the extension zip as CI artifacts with checksums attached to the draft release; publication is manual (Mario publishes the release after review). No dependence on prd-012.

### Out of scope

- Linux packages; signing/notarization activation and auto-update (ADR-020 defers all three).
- Delta updates or an update server.
- CI publication automation for releases (release mechanics can follow; this PRD needs reproducible local builds and, at most, artifact-attaching workflow seams).

### Dependencies

- **Blocks:** module AC7 and AC8 (final gate).
- **Blocked by:** sub-PRDs a-f (everything packages into this).
- **External:** electron-builder; Playwright browser binaries; ffmpeg binaries (same distribution source the CLI toolchain already uses).

## User Stories

### US-18g.1 - Build the installers

**As a** maintainer, **I want** one command that produces both installers, **so that** distribution is a reproducible build, not a manual ceremony.

**Acceptance criteria:**
- AC-18g.1.1 Given a clean checkout, when `pnpm --filter @waggle/desktop dist` runs, then Windows NSIS and macOS dmg artifacts are produced, unsigned, named with the app version, in a deterministic output directory.
- AC-18g.1.2 Given the build config, then signing is off by default with a comment citing ADR-020, and an env-gated seam exists that, when the certificate is provided, produces signed artifacts without other config changes.
- AC-18g.1.3 Given the artifacts, then the app they install satisfies every sub-PRD a-f acceptance criterion (packaging changes nothing about behavior).
- AC-18g.1.4 Given the artifacts, then a SHA-256 checksum is published for each (checksums file attached to the release; verification command documented per platform).
- AC-18g.1.5 Given the packaged app, then no auto-updater is present (no publish provider wired, no update-check behavior) and the install copy documents the manual update path.
- AC-18g.1.6 Given the build, then the packed extension `.zip` (fixed manifest `key`) is produced alongside the installers.

### US-18g.2 - The runtime floor is checked, not assumed

**As a** maintainer, **I want** an embedded-Node mismatch to fail the build, **so that** a silent runtime downgrade never ships.

**Acceptance criteria:**
- AC-18g.2.1 Given the build, when the pinned Electron's embedded Node is below the repo's Node 24+ floor, then `dist` fails with a message naming both versions.
- AC-18g.2.2 Given an Electron major bump PR, when it upgrades the embedded Node, then the check re-evaluates automatically with no manual step.

### US-18g.3 - Chromium and ffmpeg arrive with a decided strategy

**As a** installer, **I want** replay to work on first use, **so that** the zero-terminal promise survives the first `waggle regen`.

**Acceptance criteria:**
- AC-18g.3.1 Given the chosen strategy (bundled resources or first-run download), when a fresh install reaches its first replay, then Playwright's Chromium and ffmpeg are available without terminal steps.
- AC-18g.3.2 Given first-run download is chosen, then it shows progress in-app, fails visibly with a retry, and never silently falls back to a missing runtime.
- AC-18g.3.3 Given either strategy, then the decision and its size/first-run tradeoff are documented in this PRD's qa notes and the install docs.

### US-18g.4 - Install copy tells the truth about the warning

**As a** user, **I want** to know the SmartScreen/Gatekeeper warning is expected and how to get past it, **so that** an honest unsigned install doesn't read as malware (ADR-020's stated consequence).

**Acceptance criteria:**
- AC-18g.4.1 Given the install docs (README section or download page), then they state the expected warning per platform, the publisher identity, and the exact override steps (Windows "More info → Run anyway"; macOS right-click → Open, or Settings-approved open).
- AC-18g.4.2 Given the docs, then every install step is terminal-free.
- AC-18g.4.3 Given the docs, then they state that builds are unsigned, why, and that signing arrives later without any user action being required now.

### US-18g.5 - The zero-terminal pass

**As a** the module owner, **I want** the whole promise proven once, **so that** "zero-terminal" is evidence, not a claim.

**Acceptance criteria:**
- AC-18g.5.1 Given a clean machine profile (fresh OS user) with only the installer and Chrome present, when the full flow runs - install, launch, enter provider keys, record the fixture app via the extension, automatic processing, finished render - then no terminal is opened at any point, recorded as screenshots/video into `qa/`.
- AC-18g.5.2 Given that pass, when complete, then the headed `chrome.tabCapture` manual validation HANDOFF-3 requires is part of the same recording.

## Technical Considerations

- **Resource strategy decision (made here, revisitable):** bundle ffmpeg as an app resource (small, license-compatible with the AGPL app per ADR-013's posture - record the ffmpeg build's license in qa notes); Playwright Chromium bundled as well in v1, because a first-run download is a second network dependency and a first-run failure mode, and installer size is already accepted by ADR-020's consequences. If bundle size becomes intolerable, the first-run download path is the documented alternative (AC-18g.3.2 specs it so the swap is designed, not improvised).
- **`PLAYWRIGHT_BROWSERS_PATH=0`** style bundling or `extraResources` pointing the replay package's browser lookup at the packaged location - wire via env in main before importing the replay package.
- **Engine floor check:** a small pre-dist script comparing the pinned Electron's Node against the root `engines` floor; prints both versions on failure (AC-18g.2.1).
- **Icons/protocol:** protocol declaration must be present in electron-builder config for Windows registry registration (sub-PRD e depends on it in packaged builds).
- **CI:** artifact-building workflow job is allowed but publication is out of scope; expensive packaged-build e2e stays out of required checks per HANDOFF-3's PRD-012 guidance on expensive seams.

## Files Touched

### New files
- `apps/desktop/electron-builder.yml` - targets, asar, protocol, icons, signing-off seam
- `apps/desktop/scripts/check-engine-floor.mjs`
- `apps/desktop/scripts/` resource bundling helpers (ffmpeg, Chromium placement, env wiring)
- Install docs section (README or `apps/desktop/docs/install.md`)
- Clean-machine pass evidence into `qa/`

### Modified files
- `apps/desktop/package.json` - `dist` script chain: engine check → build → electron-builder
- Sub-PRD a's boot path - resource-location env wiring before replay import

## Test Plan

- Build: `dist` succeeds unsigned on both targets from a clean checkout; artifact naming asserted (AC-18g.1.1); engine-floor check fails against a seeded too-old Electron version fixture (AC-18g.2.1).
- Packaged smoke: install the artifact on a clean profile, health endpoint answers, first replay finds Chromium+ffmpeg with no terminal (AC-18g.3.1).
- Docs: review checklist that every step is terminal-free and the warning/override copy matches each platform's actual dialog (AC-18g.4.1/2).
- Evidence: the AC-18g.5.1/5.2 pass recorded into `qa/`.

## Risks and Open Questions

- **Risk:** unsigned SmartScreen reputation makes download friction severe on Windows. **Mitigation:** accepted by ADR-020; docs manage expectations; signing seam is one env var away.
- **Risk:** bundled Chromium inflates the installer ~150 MB on top of Electron. **Mitigation:** accepted consequence recorded in ADR-020; first-run download is the designed alternative.
- **Risk:** antivirus false positives on unsigned Electron binaries. **Mitigation:** document alongside the override copy; no code-side mitigation available while unsigned.
- **Open question:** macOS quarantine behavior for un-notarized dmg - right-click-open flow must be verified on a real machine in the AC-18g.5 pass; note the result in qa.
- **Resolved (2026-08-21):** whether artifacts should also build in CI on tagged pushes - yes: build-only with checksums attached to a draft release, publication manual, decided standalone above (the earlier deferral to unbuilt PRD-012 was backwards).

## Related

- [PRD-018 index](./prd-018-desktop-application-index.md)
- [ADR-020 - unsigned distribution decision](../../../knowledge/private/architecture/ADR-020-electron-desktop-shell-unsigned-builds.md)
- [ADR-016 - installer consequences](../../../knowledge/private/architecture/ADR-016-studio-packaged-desktop-app.md)
