# Security audit - 2026-08-21 - prd-010 PR review fixes

## Executive summary

- Scope: fresh credential-boundary re-evaluation after the sibling prd-009 CodeQL remediation and a Studio credential-marking test-signature correction.
- Findings: **0 Critical, 0 High, 0 Medium, 1 Low**. The pre-existing loopback-only Studio residual is unchanged.
- Ship Gate status: **cleared for the post-fix quality pass**.

## Evidence

- `apps/studio/src/routes/api/credential-markings/+server.ts:43` retains the value-free, `no-store` credential-marking response and uses `satisfies RequestHandler` without changing request handling.
- `apps/studio/test/routes/api-endpoints.test.ts:165` now invokes the zero-argument GET implementation without a synthetic trailing event.
- The determinism remediation passes only animation settings and URL-exclusion strings as structured data; it does not touch credential values or references.
- Lint, all typechecks, build, 764 tests, replay/Studio/extension E2Es, and the dependency audit passed.

## Re-evaluation conclusion

Reference-only credential storage, callback-only value resolution, TOTP, capture/replay redaction, provider-image confinement, and shared scrubbers remain effective. No Medium-or-above finding remains.
