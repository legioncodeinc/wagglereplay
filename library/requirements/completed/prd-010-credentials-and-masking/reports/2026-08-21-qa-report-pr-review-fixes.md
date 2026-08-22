# QA Report: prd-010 Credentials and masking, PR review fixes

## Summary

The post-security PR-review audit passes prd-010. The Studio change corrects a handler/test signature mismatch without changing credential behavior, and the sibling determinism remediation does not widen any credential boundary; all five acceptance criteria remain verified.

## Scorecard

| Axis | Result | Evidence |
| --- | --- | --- |
| Completeness | ✅ | 5/5 acceptance criteria remain implemented. |
| Correctness | ✅ | Studio 40/40 and full workspace 764/764 tests pass. |
| Alignment | ✅ | The GET response remains selector-role-only and `no-store`. |
| Gaps | ✅ | No plan-relative gap found. |
| Detrimental Patterns | ✅ | No credential value, reference, or redaction behavior changed. |

## Critical Issues (must fix)

None.

## Warnings (should fix)

None.

## Suggestions (consider improving)

None.

## Plan Item Traceability

| Item | Status | Evidence | Notes |
| --- | --- | --- | --- |
| AC1 schema and creds check | ✅ | Full suite and prior canary report. | Unchanged. |
| AC2 act-time resolution | ✅ | Full suite and replay E2E. | Unchanged. |
| AC3 RFC 6238 TOTP | ✅ | Replay suite 63/63. | Unchanged. |
| AC4 marking and redaction | ✅ | `apps/studio/src/routes/api/credential-markings/+server.ts:43`; Studio 40/40; real E2Es. | Signature-only correction. |
| AC5 shared scrubber | ✅ | Full suite 764/764. | Unchanged. |

## Files Changed

- `apps/studio/src/routes/api/credential-markings/+server.ts`: preserve the real zero-argument signature while satisfying SvelteKit's handler contract.
- `apps/studio/test/routes/api-endpoints.test.ts`: remove the superfluous synthetic event.
- Sibling prd-009 determinism files: security remediation with no credential-boundary change.
