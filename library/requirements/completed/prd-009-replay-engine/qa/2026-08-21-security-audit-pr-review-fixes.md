# Security audit - 2026-08-21 - prd-009 PR review fixes

## Executive summary

- Scope: fresh security re-evaluation after GitHub CodeQL identified executable-source construction in the deterministic browser initialization path.
- Findings: **0 Critical, 0 High, 0 Medium, 1 Low**. The prior loopback-only Studio residual remains unchanged; no new unresolved finding exists.
- Resolution: dynamic determinism configuration is now passed through Playwright's separately serialized function-argument channel rather than interpolated into JavaScript source.
- Ship Gate status: **cleared for the post-fix quality pass**.

## Evidence

- `packages/replay/src/determinism/assets.ts:36` builds a plain serializable payload and copies the caller's exclusions.
- `packages/replay/src/determinism/assets.ts:53` installs the payload as data in the browser and creates the animation stylesheet through DOM APIs.
- `packages/replay/src/determinism/context.ts:83` passes the function and payload separately to `BrowserContext.addInitScript`.
- `packages/replay/src/steps/settle.ts:63` reads exclusions lazily, so init-script registration order cannot capture stale configuration.
- Deterministic sweeps found no `eval`, `new Function`, or former string-building API in replay source or tests.
- Lint, all typechecks, build, 764 tests, replay/Studio/extension E2Es, and the dependency audit passed. The dependency audit retains one Low item and no Moderate-or-higher advisory.

## Re-evaluation conclusion

The CodeQL root cause is removed rather than suppressed. Existing selector, capture, credential, filesystem-confinement, and redaction controls remain intact. No Medium-or-above finding remains.
