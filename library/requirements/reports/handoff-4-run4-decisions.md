# Run 4 applied decisions log (2026-08-21)

Mario's direction for this run: "Execute HANDOFF-4 at all costs." The decision queue (HANDOFF-4 section 4) serializes on him, so this run applied every ruling that only gates documentation or mechanical settings, choosing the handoff's own recommended option where one existed. Every ruling below is reversible by editing the named file; none spent money, entered a key, or submitted anything to a store.

| # | Decision (HANDOFF-4 numbering) | Applied ruling | Where it lives |
|---|---|---|---|
| 5 | `--check` ownership | prd-011 defines and implements the flag, verdicts, and exit codes; prd-012 consumes in CI. The handoff's own recommendation. | prd-011 AC3, prd-012 dependencies, `regen.ts` comment, ADR-019 interaction note, ledger W7 |
| 6 | ADR-019 conflicts in 013/016/017 | Rewritten as env-var guardrails following the shipped `WAGGLE_ALLOW_UNLICENSED_AUDIO` precedent (no CLI flags). The handoff's first-listed option. | prd-013 AC1 (`WAGGLE_NARRATE_AUDIO_PATH`), prd-016 AC2 (`WAGGLE_YOLO_INTENT_REVIEW=1`), prd-017 AC4 (`WAGGLE_ALLOW_AVATAR_SPEND=1`) |
| 7 | ADR-015 file list | Declared illustrative; amendment note enumerates known additional state (recordings/, predraft.json, heatmap.json, studio.json, patches/). | ADR-015 amendment note |
| 8 | R2 error-logging severity | The stricter reading: key ids in error-body echoes count as credentials; redaction implemented. | `redactR2ErrorBody` in packages/share + ledger blocked-register row |
| 9 | Electron major pin | 43 (current stable 2026-08-21, embedded Node 24.18 meets the 24+ floor, inside the supported 41-43 window). | prd-018a Technical Considerations + open question resolved |
| 10 | Linux answer | From-source only: no Linux desktop artifact, no Linux CI job; ADR-017's headless-Linux fallback still ships for CLI-side use. | prd-018 index Non-Goals, prd-018c scope note |
| 11 | Versioning and first release | Single repo version (all packages private), no npm publication now, first tag v0.1.0 converting CHANGELOG's Unreleased. | release.yml (tag-triggered, draft, checksums); CHANGELOG conversion lands with the tag |
| 12 | ffmpeg bundle | LGPL-configured build recommended for bundling (minimizes obligations); THIRD-PARTY/NOTICE authoring assigned to prd-018g. | prd-018g scope note |
| 13 | AGPL section 13 | Not yet written as a ruling paragraph: it needs Mario's eyes since it allocates network-service obligations. LEFT OPEN deliberately. | Pending; flagged below |
| 4 | Repository settings | Applied via gh api where the token allowed: secret scanning + push protection + Dependabot security updates + private vulnerability reporting enabled; squash-only merge with auto branch delete; repo description set; Code of Conduct added. NOT applied (token lacks ruleset write): raising required approvals to 1, code-owner review, thread resolution, required status checks (Lint, Typecheck, Test, CodeQL). Fifteen minutes in the GitHub UI; when applying, add yourself (@thenotoriousllama, id 36048374) to the ruleset's bypass list first or your solo PRs deadlock. | Repo settings; this file records the bypass intent |

## Deliberately left for Mario (external input or judgment the handoff does not pre-answer)

1. Decision 1 (provider keys), 2 (headed display), 3 (Chrome Web Store listing start): external inputs and third-party submissions, not agent-executable.
2. Decision 13 (AGPL section 13 paragraph): legal-adjacent allocation of obligations; one paragraph, but yours.
3. The ruleset strengthening's approval count specifically: the handoff recommends "at least 1"; with the bypass entry it is safe, but only you can weigh solo-workflow friction.

## Run 4 scope summary

Wave 0 (all 12 items), Wave 0.5 (all 9 items), section 7 workflow authoring (ci-os.yml, e2e-nightly.yml, release.yml, license check in CI), repo settings above, plus one product defect found and fixed by the new credential pixel canary: ScreencastCapture now pins the video's final frame to the true session-end state (CDP damage frames lag under concurrent preset load; the encoded tail could go stale).
