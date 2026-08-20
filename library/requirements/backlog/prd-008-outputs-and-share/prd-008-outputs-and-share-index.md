# prd-008: Outputs and share export

Status: backlog | Phase: 1 | Created: 2026-08-20

## 0. Dependencies

Blocking PRDs: prd-007 (renders exist). Governing ADRs: ADR-009 (local + static export; R2 optional). Corpus: economics-archive.md (delivery notes in replay-and-render.md).

## Goal

Make finished work usable: renders/ management (naming, metadata sidecars, cleanup), `waggle export` static share bundle (self-contained HTML page: player, poster, VTT captions, transcript, downloads), optional R2 uploader.

## Non-goals

Hosted service of any kind, adaptive bitrate, analytics.

## Acceptance criteria

Wave 1:
- AC1: Render outputs follow a stable naming scheme with a JSON sidecar (IR version, kit, preset, native-vs-reframed label, duration, checksum).
- AC2: `waggle export <walkthrough>` emits a share bundle: one self-contained HTML page per walkthrough with poster, HTML5 player, captions track, transcript, download links; passes a link-integrity check.

Wave 2:
- AC3: Optional R2 upload (env-configured) pushes the bundle and prints the public URL layout; absent env config, the command explains exactly what to set.
- AC4: `waggle clean` prunes stale renders by age/version with a dry-run default.

## Task decomposition (each task 10 minutes or less)

| # | Task | AC | Bee |
|---|---|---|---|
| 1 | Naming scheme + sidecar writer | AC1 | typescript-node-worker-bee |
| 2 | Share page template (single-file HTML) | AC2 | ux-ui-svelte-worker-bee |
| 3 | Bundle assembler + link-integrity test | AC2 | typescript-node-worker-bee |
| 4 | R2 uploader (S3 API) + env guidance text | AC3 | typescript-node-worker-bee |
| 5 | Clean command with dry-run | AC4 | typescript-node-worker-bee |
| 6 | Export e2e on fixture render | AC2 | quality-worker-bee |

## QA evidence

qa/ receives an exported bundle screenshot set.
