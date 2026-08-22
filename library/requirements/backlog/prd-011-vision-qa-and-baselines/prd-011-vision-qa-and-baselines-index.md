# prd-011: Vision QA and visual baselines

Status: backlog | Phase: 2 | Created: 2026-08-20 | Amended: 2026-08-21 (Wave 0: --check ownership ruling, precision fixes)

## 0. Dependencies

Blocking PRDs: prd-009 (per-step screenshots from replay). Governing ADRs: ADR-005 (odiff in-house), ADR-008 (scrubbed prompts), ADR-017 (provider keys: the vision key is a provider key; GUI entry via the encrypted store, env refs on the CLI/CI path), ADR-019 (CLI freeze: prd-011 owns defining and implementing the `--check` flag, per the 2026-08-21 ownership ruling recorded in ADR-019's interaction note; prd-012 only consumes it). Corpus: replay-and-render.md.

Dispatch order: prd-011 lands before prd-012 (the ledger's Run 4 wave table reflects this).

## Goal

Two guards on every regen: a fast vision model verdict per step (does the settled screen match the step's intent, any visible errors) and odiff pixel baselines per step per preset, both surfaced in the studio and in `waggle regen --check` exit codes. Plus the self-heal proposal path for selector drift.

## Non-goals

Autonomous exploration (prd-015), fixing the target app.

## Intent-text source (normative)

The step intent text sent to the vision provider is the narration `approvedText` for the step, resolved by `stepIndex`. Steps with no narration get a generated fallback derived from the IR step record (action verb + target label + route), clearly marked `generated: true` in the verdict provenance so a reviewer knows the intent text was not human-approved.

## Acceptance criteria

Wave 1 (parallel):
- AC1: Verdict adapter (provider-agnostic, Gemini Flash-Lite default via env): screenshot + scrubbed step intent (see Intent-text source) to strict schema {matches_intent, anomalies[], confidence}; intent text is scrubbed with `createSensitiveTextScrubber` from `@waggle/ir` before it leaves the process; malformed responses retry once then mark unavailable, never crash a render. Replay screenshots reach the provider only through prd-010's attestation contract extended to the replay path: PNG bytes attested by the current capture run, empty allowlist blocks everything by default. No new provider-payload surface is invented.
- AC2: odiff baseline store in baselines/: accept/update/compare per step per preset; diffs over threshold produce annotated artifacts.

Wave 2:
- AC3: `waggle regen --check`: prd-011 defines and implements the flag, the verdict set, and the exit-code contract (extend `packages/cli/src/exit-codes.ts`; highest code today is 25) distinguishing clean, visual-diff, intent-fail, step-fail; run report gains per-step verdicts and diff refs with a RunReport schema version bump. prd-012 consumes this contract in CI; it does not define it.
- AC4: Studio review surface: flagged steps render verdict, diff overlay, accept/reject baseline buttons writing to baselines/. Rides the authenticated routes prd-018b introduces (prd-018b lands first); no retrofitted auth.
- AC5: Self-heal: on locate failure, an observe pass proposes candidate selectors as an IR patch draft requiring author approval in the studio (never auto-applied). Patch drafts are files in `patches/` (one JSON per draft: source IR version, stepIndex, current selector, proposed selector(s) with observe evidence refs, status pending/applied/rejected); `patches/` is project state under the ADR-015 illustrative-list ruling. Applied patches produce a new IR version per the immutability rule, never an in-place edit.
- AC6: Cost guard: per-run QA spend estimate printed; QA skippable per run via the `WAGGLE_SKIP_VISION_QA=1` env var (no CLI flag, per ADR-019); total tokens logged.

## Task decomposition (each task 10 minutes or less)

| # | Task | AC | Bee |
|---|---|---|---|
| 1 | Verdict schema + adapter + retry policy | AC1 | mind-worker-bee |
| 2 | Gemini client + image sizing (cap DPR upload cost) | AC1 | typescript-node-worker-bee |
| 3 | odiff wrapper + baseline store layout | AC2 | typescript-node-worker-bee |
| 4 | Threshold config + annotated diff artifacts | AC2 | typescript-node-worker-bee |
| 5 | Exit-code contract + run-report merge | AC3 | typescript-node-worker-bee |
| 6 | Studio flagged-step review UI | AC4 | ux-ui-svelte-worker-bee |
| 7 | Accept/reject baseline actions | AC4 | svelte-worker-bee |
| 8 | Observe-based selector proposal + IR patch draft | AC5 | mind-worker-bee |
| 9 | Approval flow in studio | AC5 | svelte-worker-bee |
| 10 | Cost estimator + env skip guard | AC6 | typescript-node-worker-bee |

## QA evidence

qa/ receives a seeded-defect run (intentionally broken fixture) showing catch rates.
