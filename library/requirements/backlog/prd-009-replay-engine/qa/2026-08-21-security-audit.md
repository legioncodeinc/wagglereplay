# Security audit - 2026-08-21 - prd-009 replay engine

## Executive summary

- Scope: the complete uncommitted prd-009/prd-010 implementation and immediate trust-boundary neighbors, with emphasis on Playwright act mapping, credential injection, CDP screencast capture, screenshot redaction, replay manifests and media references, ffmpeg subprocesses, Studio's credential-marking endpoint, CLI error/output handling, pre-draft and narration scrubbers, dependencies, lockfile changes, CI, and browser provisioning.
- Coverage: **reduced coverage, declared.** The security-stinger catalog is optimized for SvelteKit with Neon/Drizzle, WorkOS, Stripe, Vercel, Doppler, and GoHighLevel. This repository is a local-first Node/Playwright/ffmpeg workspace with one loopback SvelteKit app and none of the database, hosted-auth, payment, hosted-deployment, or webhook surfaces. Every applicable catalog surface was checked, and the replay/filesystem/subprocess/privacy boundaries outside the catalog were reviewed directly.
- Findings: **0 Critical, 4 High, 0 Medium, 1 Low.** All four High findings were fixed before this report was written. The Low item is a known loopback-server residual already documented in the workspace-level 2026-08-21 security audit.
- Ship Gate status: **cleared to proceed to quality-stinger.** All Medium-or-above findings are resolved and the complete re-evaluation passed.
- Shared audit: the credentials/privacy findings are cross-reported in `../../prd-010-credentials-and-masking/qa/2026-08-21-security-audit.md`; that report is the primary record for the credential API and pre-draft boundary.

## Surface coverage checklist

### SvelteKit attack surface

- The new `GET`/`PUT /api/credential-markings` route was reviewed. `GET` returns selector roles only, with `cache-control: no-store`; it returns neither environment-reference names nor resolved values. `PUT` parses a strict JSON object, trims the selector, caps it at 4096 characters, validates the field kind, and writes through the canonical credential schema.
- The credential store performs an atomic temporary-file rename and requests mode `0600`. No value-resolution path exists in Studio.
- CSRF/browser drive-by review: the mutating endpoint requires JSON, so a cross-origin browser request is preflighted, and SvelteKit's origin checking remains enabled. No `{@html}` sink was added.
- **One Low residual:** Studio endpoints, including this new endpoint, have no application authentication and rely on the default `127.0.0.1` bind. See the Low finding below. No new Medium-or-above SvelteKit issue remains.

### Authorization and tenancy (Drizzle / Neon)

**Not applicable.** ADR-015 uses filesystem project directories and this change introduces no database, ORM, tenant, organization, or RLS surface. Project selection is performed once by the local CLI and passed to the Studio child process; no request parameter chooses an arbitrary project root.

### Secrets and environment

- Deterministic secret-shape and assigned-secret sweeps found no committed live credential. `.env.example` contains documented blank fields and explicit `replace-me` placeholders, not usable secrets. No `.env`, private key, or `credentials.json` value file is tracked, including in reachable git history.
- `credentials.json` stores environment-reference names only. Values are read at act time. CLI checks print missing reference names and counts, never values. Binding and TOTP errors scrub reference-adjacent values before entering structured failures or logs.
- **One High finding was fixed:** the replay package originally exposed a plaintext-returning credential resolver/factory as public API. The public package now exposes the callback-only act boundary and safe error types, not the resolver/factory. See finding H2.

### Webhooks and third-party intake

**None detected / not applicable.** No Stripe, GoHighLevel, inbound webhook, signed callback, or hosted third-party intake was introduced. The local extension-to-Studio upload contract is unchanged by these PRDs and was already covered by the workspace audit.

### Dependencies and supply chain

- `pnpm-lock.yaml` changes are limited to the replay workspace links and already-known `playwright-core`, `zod`, and `tsx` resolutions. No new unrecognized or near-miss package and no lockfile URL/integrity anomaly was found.
- `pnpm audit --audit-level high --json` reported 0 Critical, 0 High, and 0 Moderate vulnerabilities. Its metadata reports one Low vulnerability but supplies no advisory record; it is non-blocking and should continue to be monitored.
- CI installs with `pnpm install --frozen-lockfile`. GitHub actions are pinned to full commit SHAs. CI installs ffmpeg 9.0 and the real replay E2E found the locally provisioned Playwright Chromium.
- pnpm's audit output does not provide npm's lockfile-signature verification path, so registry-signature provenance is a tooling coverage limitation, not a detected vulnerability.

### Headers and transport

- Studio defaults explicitly to `127.0.0.1` over local HTTP. No hosted or Internet transport is part of the feature.
- The unauthenticated-loopback/DNS-rebinding residual remains Low and is detailed below. CSP, HSTS, and hosted WAF controls are not applicable to the packaged/local runtime described by ADR-014 and ADR-016.
- Outbound pre-draft and narration provider calls retain HTTPS endpoints and authorization headers are not logged.

### AI-generated code patterns

- Authorization consistency was checked across the new Studio route: it has the same loopback trust model as sibling Studio endpoints and does not create a uniquely less-protected route.
- **Two High missing-boundary failures were fixed:** replay/recording media and manifest references are now confined to the project root lexically and after symlink resolution (H3), and pre-draft image references receive the same treatment before any provider payload is built (H4).
- **One High dangerous-convenience API was fixed:** callers can no longer receive a resolved credential from the public replay package (H2).
- No silent fallback turns an unresolved credential into a literal project value. Missing, ambiguous, or invalid bindings fail with scrubbed structured errors.

### PII and logging hygiene

- **One High visual-secret exposure was fixed:** the opaque credential overlay is now installed before the fill action and remains for the continuous CDP screencast and post-step screenshot (H1).
- Run reports and replay failures use the shared scrubber. Prompt input and generated/persisted text are scrubbed. The pre-draft image loader no longer accepts an out-of-project asset reference (H4).
- Extension telemetry stores a fixed placeholder for marked inputs, not a typed value. The canary battery, CLI output tests, screenshot-overlay tests, prompt tests, and narration guardrails all passed.
- No credential/PII logging call was found in the changed production code.

## Findings detail

### [HIGH] Credential fill was visible to the continuous screencast before screenshot-only redaction

- **Location:** `packages/replay/src/steps/replay-step.ts:188`
- **Surface:** PII and logging hygiene; secrets and environment
- **Description:** the pre-remediation step sequence performed the credential act/fill first, then created an opaque overlay only around `page.screenshot()`. CDP screencast capture runs continuously, so one or more encoded frames could contain the resolved username, password, or TOTP even though the still screenshot was redacted. A replay video is a shareable output, making this a direct credential-disclosure path.
- **Evidence:** the vulnerable ordering was effectively `await actStep(...); ... await applyOpaqueRedactionOverlay(...); await page.screenshot(...)`. Screenshot redaction did not retroactively cover screencast frames emitted during the fill.
- **Remediation:** `replayStep` now determines whether the step is credential-bound immediately after locate, applies a persistent opaque overlay at `packages/replay/src/steps/replay-step.ts:188-196`, and only then calls `actStep` at `:198-209`. The overlay remains through settle and the screenshot, and navigation/context teardown removes it naturally. The regression test observes the overlay both during the fill callback and at screenshot time, and confirms it is not removed between them.
- **Status:** fixed in this session.

### [HIGH] Public replay API allowed resolved credential plaintext to escape the act-time boundary

- **Location:** `packages/replay/src/credentials/binding.ts:25`; `packages/replay/src/credentials/index.ts:1`
- **Surface:** secrets and environment; AI-generated code patterns
- **Description:** the initial binding interface included a plaintext-returning `resolveValue` method, and the public replay barrel exported the binding factory/types. That made it easy for any package consumer to retain, log, serialize, or attach a resolved credential to a report, contrary to ADR-008 and prd-010 AC2's requirement that values exist only inside the fill action.
- **Evidence:** the vulnerable public shape included `resolveValue(step)` returning the resolved string and a barrel export of `createCredentialBindings` / `CredentialBindings`.
- **Remediation:** `CredentialBindings` now exposes only `actWithValue(step, async value => ...)` as the value-bearing boundary (`binding.ts:25-40`, implementation at `:237-257`). The factory remains an internal module dependency of orchestration, but package exports expose only scrubbed error types and TOTP utilities (`credentials/index.ts:1-14`). Tests can observe a value only inside the void-returning callback.
- **Status:** fixed in this session.

### [HIGH] Replay and source media references could escape the project directory

- **Location:** `packages/compose/src/render/render-project.ts:110`; callers at `:210`, `:233`, and `:263`
- **Surface:** AI-generated code patterns; PII and filesystem hygiene
- **Description:** replay index entries and the IR's source-recording reference were only non-empty strings. Passing them directly to `path.resolve(projectDir, reference)` allowed `../` or an absolute path to select a file outside the project. A malicious or merely untrusted git-committable project could cause the compositor to read an arbitrary local video into a shared render; the manifest path had the same escape primitive.
- **Evidence:** pre-remediation call sites used `const replayPath = path.resolve(projectDir, entry.videoRef)`, `const videoPath = path.resolve(projectDir, recording.videoRef)`, and `const manifestPath = path.resolve(projectDir, entry.manifestRef)` without a containment check.
- **Remediation:** `resolveProjectReference` rejects absolute references, rejects lexical escapes with `path.relative`, canonicalizes existing paths with `realpathSync`, rejects symlink escapes, and returns the canonical contained path. Original recording, replay video, and replay manifest callers all use it and fail closed with non-sensitive errors. Traversal regression tests cover all three reference classes.
- **Status:** fixed in this session.

### [HIGH] Pre-draft image references could exfiltrate an arbitrary local file to an AI provider

- **Location:** `packages/ingest/src/predraft/run-predraft.ts:59`; read boundary at `:90-93`
- **Surface:** PII and logging hygiene; AI-generated code patterns
- **Description:** a step asset reference was joined to the project directory and read as bytes without confinement. A crafted `../` reference could read an out-of-project image and base64-encode it into an OpenAI/Anthropic request. This is a direct local-file/PII exfiltration path at a third-party prompt boundary.
- **Evidence:** the vulnerable read was `await readFile(path.join(projectDir, ref))` for `step.waggle.assets.before/click`.
- **Remediation:** `resolveProjectImage` rejects absolute and lexical escapes, canonicalizes both root and candidate, rejects symlink escapes, and fails closed to a text-only prompt when confinement cannot be proven. A regression test places an image outside the project, references it via traversal, captures provider request bodies, and asserts its bytes are absent.
- **Status:** fixed in this session.

### [LOW] Studio mutation endpoints rely on loopback binding rather than application authentication

- **Location:** `apps/studio/src/routes/api/credential-markings/+server.ts:43` and `:57`; `packages/cli/src/commands/studio.ts:7` and `:32`
- **Surface:** SvelteKit attack surface; authorization; headers and transport
- **Description:** the new route, like its sibling Studio routes, performs no session or bearer-token check. The safe default binds to `127.0.0.1`, JSON mutation is protected from ordinary cross-origin form submission, and the route never returns values, so the practical residual requires local access, DNS rebinding, or the user explicitly binding Studio to a non-loopback host. This is the same Low issue recorded in `library/requirements/reports/2026-08-21-security-audit.md`, not a new regression unique to prd-009/010.
- **Evidence:** handlers call `getProjectDir()` directly and `studio.ts` exposes `--host <host>` while defaulting to `127.0.0.1`; there is no `hooks.server.ts` authorization layer.
- **Remediation:** documented for the packaged-Studio hardening backlog: enforce an allowed Host/origin or per-launch token, keep loopback as the only default, and select a finite per-upload body limit. This Low item is not automatically changed here because the correct token/desktop-launch contract and upload ceiling are product decisions spanning every Studio endpoint.
- **Status:** documented for follow-up; cross-reference to the pre-existing workspace finding.

## Remediation summary

| Severity | Count | Fixed this session | Documented only |
|---|---:|---:|---:|
| Critical | 0 | 0 | 0 |
| High | 4 | 4 | 0 |
| Medium | 0 | 0 | 0 |
| Low | 1 | 0 | 1 |

Security remediation changed only these code/test files:

- `packages/replay/src/steps/replay-step.ts`
- `packages/replay/src/credentials/binding.ts`
- `packages/replay/src/credentials/index.ts`
- `packages/replay/test/replay-step.test.ts`
- `packages/replay/test/credentials/binding.test.ts`
- `packages/compose/src/render/render-project.ts`
- `packages/compose/test/render-project.test.ts`
- `packages/ingest/src/predraft/run-predraft.ts`
- `packages/ingest/test/predraft/run-predraft.test.ts`

No test was skipped, weakened, or deleted. No commit or push was made.

## Re-evaluation

A full security-stinger re-evaluation ran after all High fixes landed:

- Repeated deterministic sweeps for secret/key shapes, assigned secrets, public-secret environment names, dynamic HTML/eval sinks, SQL/raw execution, subprocesses, auth/webhook surfaces, PII logging, tracked secret files, git-history secrets, and CI install mode. No new Medium-or-above issue was detected.
- Re-read all changed trust boundaries and verified the two confinement helpers reject absolute paths, lexical traversal, and existing symlink escapes.
- `pnpm audit --audit-level high --json`: 0 Critical, 0 High, 0 Moderate; one Low metadata count with no advisory entry.
- `pnpm lint`: passed, 375 files checked.
- `pnpm typecheck`: passed across all workspace projects; Svelte reported 0 errors and 0 warnings.
- `pnpm build`: passed, including the Studio adapter-node production build and extension bundle.
- `pnpm test`: passed, **752 tests**, 0 failures.
- Targeted privacy battery: IR 14/14, replay 17/17, ingest 6/6, narration 14/14, CLI 8/8, extension 9/9, Studio 6/6.
- `pnpm --filter @waggle/replay e2e`: passed with real Playwright Chromium and ffmpeg; regenerated native/reframed manifests, screenshots, and drift report in this PRD's `qa/` directory.
- `pnpm --filter @waggle/studio e2e`: passed against the real built loopback server.
- Final `git diff` review confirmed that the security edits were limited to the nine files listed above, plus this audit report and the required prd-010 QA artifact.

## Next step

The joint prd-009/prd-010 implementation is **cleared to invoke quality-stinger**. The quality pass must run against this post-remediation tree. After quality, the orchestrator must run `github-repo-health-stinger` before any commit or push. The user must review the reports and authorize any commit/push; this audit performed neither.
