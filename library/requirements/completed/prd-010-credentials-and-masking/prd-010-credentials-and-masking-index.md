# prd-010: Credentials and masking

Status: completed (merged via PRs #1 and #2) | Phase: 2 | Created: 2026-08-20

## 0. Dependencies

Blocking PRDs: prd-003 (capture masking hooks), prd-009 (replay injection point). Governing ADRs: ADR-008 (env refs only). Corpus: walkthrough-ir-and-project-format.md.

## Goal

Authenticated demo targets replay safely: credentials.json holds env REFS; values resolve only inside packages/replay at fill time; TOTP generation from seed refs; capture-side credential marking; redaction guarantees across IR, logs, screenshots, and prompts.

## Non-goals

Any vault service, browser password-manager integration.

## Acceptance criteria

Wave 1:
- AC1: credentials.json schema (label, username_env, secret_env, totp_seed_env, applies_to selectors) validated; CLI `waggle creds check` reports which env refs resolve on this machine without printing values.
- AC2: Replay fill: input steps bound to a credential set resolve env values at act time; values never enter the IR, run reports, or thrown errors (tested with a canary value asserted absent from all artifacts).

Wave 2:
- AC3: TOTP: RFC 6238 codes generated in-process from the seed env ref at fill time.
- AC4: Capture marking: author flags a field as credential in the studio; subsequent recordings store placeholder events for it; QA screenshots of flagged steps get redaction boxes before storage.
- AC5: Prompt hygiene: narration and vision-QA payload builders share a scrubber that strips flagged values and env names; scrubber unit-tested against the canary battery.

## Task decomposition (each task 10 minutes or less)

| # | Task | AC | Bee |
|---|---|---|---|
| 1 | Schema + creds check command | AC1 | security-worker-bee |
| 2 | Env resolution + fill-time injection | AC2 | typescript-node-worker-bee |
| 3 | Canary leak test across artifacts | AC2 | security-worker-bee |
| 4 | TOTP generator | AC3 | typescript-node-worker-bee |
| 5 | Studio credential-field marking UI | AC4 | svelte-worker-bee |
| 6 | Capture placeholder events + screenshot redaction | AC4 | typescript-node-worker-bee |
| 7 | Shared scrubber + battery tests | AC5 | security-worker-bee |

## QA evidence

qa/ receives the canary leak-test log; security-stinger pass is mandatory before this PRD ships.
