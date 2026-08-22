# QA Report: prd-009 Replay engine, PR review fixes

## Summary

The post-security PR-review audit passes prd-009. The CodeQL remediation preserves all eight acceptance criteria while replacing interpolated init-script construction with function-plus-argument injection; every local gate and real E2E passes.

## Scorecard

| Axis | Result | Evidence |
| --- | --- | --- |
| Completeness | ✅ | 8/8 acceptance criteria remain implemented. |
| Correctness | ✅ | 764 tests and all three real E2E commands pass. |
| Alignment | ✅ | Deterministic replay behavior and the animation-kill toggle are unchanged. |
| Gaps | ✅ | No plan-relative gap found. |
| Detrimental Patterns | ✅ | Code construction from configuration data was removed; no replacement `eval` or `new Function` exists. |

## Critical Issues (must fix)

None.

## Warnings (should fix)

None.

## Suggestions (consider improving)

None.

## Plan Item Traceability

| Item | Status | Evidence | Notes |
| --- | --- | --- | --- |
| AC1 selector/settle/failure | ✅ | Replay suite 63/63; full suite 764/764. | Unchanged. |
| AC2 determinism kit | ✅ | `packages/replay/src/determinism/assets.ts:36`; `context.ts:83`; replay E2E. | Safer data channel, same toggle and exclusions. |
| AC3 capture/timing | ✅ | Replay E2E. | Unchanged. |
| AC4 presets/reflow | ✅ | Replay E2E and checked-in manifests. | Unchanged. |
| AC5 focus track | ✅ | Replay E2E. | Unchanged. |
| AC6 regen/drift | ✅ | Replay E2E. | Unchanged. |
| AC7 run report | ✅ | Replay E2E evidence. | Unchanged. |
| AC8 concurrency | ✅ | Full replay test suite. | Unchanged. |

## Files Changed

- `packages/replay/src/determinism/assets.ts`: structured init payload and serializable installer.
- `packages/replay/src/determinism/context.ts`: function-plus-argument Playwright injection.
- `packages/replay/src/steps/settle.ts`: lazy exclusion lookup.
- `packages/replay/src/regen/orchestrate.ts`: removed unused import.
- `packages/replay/src/index.ts` and `packages/replay/test/determinism-assets.test.ts`: updated safe API and coverage.
