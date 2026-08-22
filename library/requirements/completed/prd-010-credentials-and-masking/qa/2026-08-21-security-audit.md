# Security audit - 2026-08-21 - prd-010 credentials and masking

## Executive summary

- Scope: the complete joint prd-009/prd-010 implementation, centered on the canonical credentials schema, Studio selector marking and filesystem writes, capture placeholder telemetry, replay act-time environment/TOTP resolution, screenshot and continuous-video redaction, error/report/CLI hygiene, shared scrubbers, pre-draft/narration provider boundaries, dependencies, lockfile, CI, and browser/ffmpeg execution.
- Coverage: **reduced coverage, declared.** security-stinger's hosted SvelteKit/Neon/WorkOS/Stripe/Vercel catalog does not match this local-first filesystem/Playwright application. All applicable catalog checks ran, and filesystem, subprocess, media, and AI-provider boundaries were reviewed directly. Database tenancy, hosted auth, payments, webhooks, and hosted transport are genuinely not applicable.
- Findings: **0 Critical, 4 High, 0 Medium, 1 Low.** All four High findings were remediated. The Low loopback-auth residual was already recorded by the workspace-level audit and is carried forward because the new Studio route shares that trust model.
- Ship Gate status: **cleared to proceed to quality-stinger.** The full post-fix re-evaluation is green.
- Shared audit: the replay/compose details and the same joint finding set are also recorded in `../../prd-009-replay-engine/qa/2026-08-21-security-audit.md`.

## Surface coverage checklist

### SvelteKit attack surface

- `GET /api/credential-markings` exposes only the active set id and selector-role mappings, never environment references or values, and sends `cache-control: no-store`.
- `PUT /api/credential-markings` accepts a strict JSON schema, caps selector length at 4096, validates the kind, requires an existing bound set, validates the resulting canonical credential document, writes a `0600` temporary file, and atomically renames it.
- The route follows the same local-loopback model as existing Studio routes. JSON mutation receives browser preflight/origin protection and no dynamic-HTML sink was added.
- **One Low residual:** no Studio route has application authentication. See the Low finding.

### Authorization and tenancy (Drizzle / Neon)

**Not applicable.** There is no database or tenant model. The CLI selects one local project root before starting Studio. The request body cannot select another root, credential file, or environment.

### Secrets and environment

- `credentials.json` contains only label/id, environment-reference names, and selectors. The Studio GET surface is stricter still and omits environment-reference names.
- Environment values are resolved only during `actWithValue`; TOTP is generated in-process at the same boundary. Missing, ambiguous, invalid-seed, and fill errors are scrubbed before reaching reports or CLI output.
- The public plaintext-returning binding resolver was a High finding and was removed (H2). The package now exposes the callback-only act boundary rather than a resolved string.
- Secret and git-history sweeps found no live secret. `.env.example` contains blank demo references and explicit non-secret placeholders. Known test canaries were verified as test-only and not misclassified as credentials.

### Webhooks and third-party intake

**None detected / not applicable.** No payment, CRM, webhook, or remote callback surface was added. AI-provider requests are outbound only and are covered under PII hygiene.

### Dependencies and supply chain

- Lockfile changes add only workspace links and existing `playwright-core`, `zod`, and `tsx` resolutions. No package-name anomaly or unexpected remote resolution was found.
- `pnpm audit --audit-level high --json` returned 0 Critical, 0 High, and 0 Moderate. Metadata contains one Low count without an advisory object; non-blocking.
- CI uses the frozen pnpm lockfile, actions pinned to full SHAs, a pinned Node version, ffmpeg 9.0 provisioning, and a workspace build before tests. The real replay E2E located installed Chromium and ffmpeg successfully.
- Registry signature verification is a pnpm/tooling coverage limitation; no supply-chain finding was inferred without evidence.

### Headers and transport

- Studio binds to `127.0.0.1` by default and the product is explicitly local-first. No HSTS/WAF/hosted TLS surface is introduced.
- The residual unauthenticated-loopback/DNS-rebinding risk is Low and documented below. Outbound provider requests use HTTPS and no authorization header is logged.

### AI-generated code patterns

- The highest-risk generated-code pattern found was a dangerous convenience API: public `resolveValue` allowed a plaintext secret to escape its intended callback scope (H2). It was removed.
- Missing filesystem-boundary checks affected compose media/manifest references (H3) and pre-draft images (H4). Both now perform lexical and canonical/symlink confinement.
- Credential matching fails explicitly for ambiguous selectors; unresolved references never fall back to values in project files. Canonical schemas reject unknown/malformed structures.

### PII and logging hygiene

- Marked extension inputs are represented by a fixed placeholder event; the typed value is not placed in the IR.
- The original screenshot-only overlay left the continuous screencast exposed (H1). The overlay now precedes the act/fill and persists through video and screenshot capture.
- Shared scrubbers cover environment-reference names, marked placeholders, supplied sensitive values, and canaries before prompts, provider error text, generated narration/pre-draft text, reports, and persisted artifacts.
- The pre-draft image loader originally allowed an out-of-project asset reference to send arbitrary local bytes to a provider (H4); it now fails closed to a text-only prompt.
- CLI checks and errors identify only unresolved reference names/counts. No credential value or PII logging call was found in changed production code.

## Findings detail

### [HIGH] Continuous replay video could record a resolved credential before still-image redaction

- **Location:** `packages/replay/src/steps/replay-step.ts:188`
- **Surface:** PII and logging hygiene; secrets and environment
- **Description:** the original flow filled the field before installing an overlay for `page.screenshot()`. CDP screencast capture is continuous, so encoded frames between fill and screenshot could expose username, password, or TOTP in a shareable video.
- **Evidence:** vulnerable ordering: `await actStep(...); ... await applyOpaqueRedactionOverlay(...); await page.screenshot(...)`.
- **Remediation:** the code now establishes a step-scoped persistent opaque overlay at `replay-step.ts:188-196`, before the act at `:198-209`. It remains present during the credential callback, settle, and screenshot. A regression test inspects the DOM during fill and screenshot and proves no intermediate removal occurs.
- **Status:** fixed in this session.

### [HIGH] Public credential resolver allowed plaintext to escape act-time scope

- **Location:** `packages/replay/src/credentials/binding.ts:25`; `packages/replay/src/credentials/index.ts:1`
- **Surface:** secrets and environment; AI-generated code patterns
- **Description:** the initial interface publicly exposed a resolved-string `resolveValue` path and factory/types. A caller could retain, log, serialize, or attach the string to a run report, defeating prd-010 AC2 even if the built-in fill caller was careful.
- **Evidence:** vulnerable public shape: `resolveValue(step)` returned plaintext, and the credential barrel exported `createCredentialBindings` / `CredentialBindings`.
- **Remediation:** the only value-bearing binding method is now `actWithValue(step, action): Promise<void>` (`binding.ts:25-40`, `:237-257`). The public barrel exports scrubbed error types and TOTP utilities, not the binding factory/interface. Tests observe values only inside the action callback.
- **Status:** fixed in this session.

### [HIGH] Project media references could read arbitrary local files into a render

- **Location:** `packages/compose/src/render/render-project.ts:110`; use sites at `:210`, `:233`, and `:263`
- **Surface:** PII and filesystem hygiene; AI-generated code patterns
- **Description:** replay video, source recording, and replay manifest strings were passed directly to `path.resolve`. Traversal or an absolute reference in a shareable project could select an out-of-project local file; a selected video could then be encoded into a shared output.
- **Evidence:** pre-fix call sites used `path.resolve(projectDir, entry.videoRef)`, `path.resolve(projectDir, recording.videoRef)`, and `path.resolve(projectDir, entry.manifestRef)` without containment.
- **Remediation:** `resolveProjectReference` rejects absolute and lexical escapes, canonicalizes existing paths, rejects symlink escapes, and returns a contained canonical path. All three use sites fail closed, with traversal regression coverage.
- **Status:** fixed in this session.

### [HIGH] Pre-draft asset traversal could send an out-of-project image to an AI provider

- **Location:** `packages/ingest/src/predraft/run-predraft.ts:59`; read at `:90-93`
- **Surface:** PII and logging hygiene; AI-generated code patterns
- **Description:** `before`/`click` asset references were read using a project join with no containment. A crafted project could reference an external image and cause its bytes to be base64-encoded into an OpenAI/Anthropic payload.
- **Evidence:** vulnerable read: `await readFile(path.join(projectDir, ref))`.
- **Remediation:** `resolveProjectImage` rejects absolute paths, traversal, and canonical/symlink escapes. Missing, unreadable, or unprovable paths fail closed to a text-only prompt. The regression test captures request bodies and proves the external image bytes are absent.
- **Status:** fixed in this session.

### [LOW] Studio credential-marking mutations rely on loopback rather than application authentication

- **Location:** `apps/studio/src/routes/api/credential-markings/+server.ts:43` and `:57`; `packages/cli/src/commands/studio.ts:7` and `:32`
- **Surface:** SvelteKit attack surface; authorization; headers and transport
- **Description:** handlers do not authenticate. Default loopback binding, JSON preflight/origin checking, and value-free responses substantially limit reachability, but DNS rebinding, a local process, or an explicit non-loopback `--host` can reach the mutation surface. This is the same known Low finding already recorded for sibling Studio endpoints in `library/requirements/reports/2026-08-21-security-audit.md`.
- **Evidence:** the handlers call the process-scoped `getProjectDir()` with no session/token check; the CLI exposes `--host` while defaulting to `127.0.0.1`.
- **Remediation:** document for packaged-Studio design: add a per-launch token or strict Host/origin allow-list across all endpoints, preserve loopback-only defaults, and replace the general infinite adapter body limit with a product-selected upload ceiling. A route-local patch would create inconsistent authorization and is therefore not appropriate for this Low cross-cutting item.
- **Status:** documented for follow-up; pre-existing workspace finding.

## Remediation summary

| Severity | Count | Fixed this session | Documented only |
|---|---:|---:|---:|
| Critical | 0 | 0 | 0 |
| High | 4 | 4 | 0 |
| Medium | 0 | 0 | 0 |
| Low | 1 | 0 | 1 |

Security remediation files:

- `packages/replay/src/steps/replay-step.ts`
- `packages/replay/src/credentials/binding.ts`
- `packages/replay/src/credentials/index.ts`
- `packages/replay/test/replay-step.test.ts`
- `packages/replay/test/credentials/binding.test.ts`
- `packages/compose/src/render/render-project.ts`
- `packages/compose/test/render-project.test.ts`
- `packages/ingest/src/predraft/run-predraft.ts`
- `packages/ingest/test/predraft/run-predraft.test.ts`

The required value-free canary evidence is in `qa/canary-leak-test.md`. No test was weakened or skipped. No commit or push was made.

## Re-evaluation

A complete post-remediation pass was run because High findings changed code:

- Repeated secret, environment, history, dynamic-HTML/eval, SQL/raw execution, subprocess, auth/webhook, PII-log, tracked-secret-file, lockfile, and CI sweeps. No new Medium-or-above finding remains.
- Re-read Studio request/response shapes, credential file writes, act-time resolution/TOTP, persistent overlay timing, report/error scrubbers, narration/pre-draft provider boundaries, ffmpeg spawn arguments, and project-path confinement.
- `pnpm audit --audit-level high --json`: 0 Critical, 0 High, 0 Moderate; one non-blocking Low metadata count with no advisory entry.
- `pnpm lint`: passed (375 files).
- `pnpm typecheck`: passed across the workspace; Svelte 0 errors/0 warnings.
- `pnpm build`: passed.
- `pnpm test`: passed, **752 tests**, 0 failures.
- Targeted canary/privacy suites passed: IR 14, replay 17, ingest 6, narration 14, CLI 8, extension 9, Studio 6.
- Real `@waggle/replay` Chromium/ffmpeg E2E passed; real built `@waggle/studio` loopback E2E passed.
- Final diff review found no unrelated security-edit spillover.

## Next step

The joint prd-009/prd-010 implementation is **cleared to invoke quality-stinger**. Quality must review this post-remediation tree, then the orchestrator must run `github-repo-health-stinger` before any commit/push. The user reviews and approves before either operation; this security pass performed neither.
