# Security audit - 2026-08-21 - prd-010 post-redaction fix

## Executive summary

- Scope: a new full security-stinger pass over the post-QA capture-redaction implementation and the complete joint prd-009/prd-010 trust boundary. The pass covered credential geometry capture and serialization, timestamp alignment, ffmpeg filter construction/execution, fail-closed frame creation, pre-draft image allowlisting, project/session path confinement, raw recording scope, Studio marking, replay-time values/TOTP, shared scrubbers, CLI/report output, dependencies, CI, and real browser/ffmpeg tests.
- Ordering note: the existing `reports/2026-08-21-qa-report.md` correctly found the raw-frame defect and therefore predates both the remediation and this security pass. Its blocked conclusion is now stale by design; `quality-stinger` must run again against this post-security tree.
- Coverage: **reduced coverage, declared.** The repository is local-first Node/Playwright/ffmpeg with a loopback SvelteKit app, not the security-stinger catalog's hosted Neon/WorkOS/Stripe/Vercel stack. Every applicable catalog check ran, and the media/filesystem/provider boundaries were audited directly.
- Findings: **0 Critical, 3 High, 0 Medium, 1 Low.** The incoming QA fix closed one High privacy defect. This pass found and fixed two additional High boundary defects. The Low item is the already-known loopback-only Studio authentication residual.
- Ship Gate status: **cleared to proceed to a fresh quality-stinger pass.** All Medium-or-above findings are resolved and the complete post-fix re-evaluation passed.
- Prior security findings: all four High fixes from `2026-08-21-security-audit.md` remain present and effective; they are reverified below but are not double-counted as new findings.

## Surface coverage checklist

### SvelteKit attack surface

The credential-marking route remains value-free, strictly validates selector/kind input, sends `cache-control: no-store`, and writes through the canonical reference-only schema. The geometry and redaction fix does not expand the Studio request surface. The known Low residual remains: all local Studio endpoints rely on loopback binding instead of a per-launch application token. No new SvelteKit Medium-or-above finding was detected.

### Authorization and tenancy (Drizzle / Neon)

**Not applicable.** There is no database, ORM, tenant, or RLS model. Project and session roots are local CLI inputs rather than request-selected tenant resources. The newly hardened session-video resolver now ensures metadata cannot redirect ingest outside the selected session root.

### Secrets and environment

- Capture input events contain a fixed placeholder and a geometry object only. Geometry consists of field bounds and recorded viewport dimensions; it contains no value, character count, hash, prefix, or other value-derived property. Input/textarea element width is independent of the entered value.
- Credential values remain callback-scoped in replay; the public replay barrel still excludes the binding factory and plaintext-returning resolver. TOTP seeds are resolved only inside the act boundary and failure messages remain scrubbed.
- Deterministic current-tree and git-history sweeps found no live secret. Test-only canaries and explicit placeholders were not treated as credentials.

### Webhooks and third-party intake

**None detected / not applicable.** There is no inbound third-party webhook. The relevant third-party boundary is outbound pre-draft AI-provider intake, covered under PII and logging hygiene.

### Dependencies and supply chain

- `pnpm audit --audit-level high --json` returned 0 Critical, 0 High, and 0 Moderate vulnerabilities. Its metadata continues to report one Low item without an advisory object.
- No new dependency was required by the redaction fix. ffmpeg remains an external binary invoked by `spawn` with an argument array; CI installs the pinned ffmpeg 9.0 action and uses `pnpm install --frozen-lockfile`.
- GitHub actions remain pinned to full commit SHAs. No package-name, lockfile URL, or integrity anomaly was found.

### Headers and transport

Studio still defaults to `127.0.0.1`; no hosted transport was added. Outbound provider requests use HTTPS and their authorization headers are not logged. The pre-existing loopback/DNS-rebinding residual is recorded as Low below.

### AI-generated code patterns

- The incoming implementation correctly validates the entire redaction list before creating a step directory or PNG, uses numeric-only ratios for ffmpeg expressions, passes the filter as one argv element with no shell, and allowlists pre-draft images to references returned by the same extraction run.
- This pass found two classic missing-boundary errors: the wrong timeline anchor could activate redaction late (H2), and a metadata video filename could escape the chosen session root (H3). Both are fixed with regression coverage.
- Earlier missing-boundary fixes remain present: compose project references are lexically and canonically confined; pre-draft image paths are confined after allowlisting; replay uses a persistent overlay before fill; credential values remain callback-scoped.

### PII and logging hygiene

- The QA-discovered raw-PNG/provider defect is fixed (H1): credential geometry is bounded at capture, required by the event schema, validated again before extraction, projected through ffmpeg `iw`/`ih`, applied before PNG creation, and verified with real pixel decoding. Pre-draft reads only extractor-attested refs and sends the exact persisted redacted PNG bytes.
- Missing, zero-size, non-finite, out-of-bounds, absolute, traversing, or symlink-escaping inputs fail closed. An explicit filter-injection-shaped coordinate string is rejected before filter generation.
- Raw source recording caveat: the original capture video is intentionally retained as the local ingest/render source. PRD-010's stated guarantee covers IR, logs, QA screenshots, and prompts, while AC4 specifically requires QA screenshot boxes before storage. It does not claim that the raw capture master is rewritten. The raw file therefore remains a sensitive local source artifact and must not be treated as a shareable QA/render output. Replay-generated shareable video retains the persistent credential overlay. This is a documented scope/handling caveat, not a violation of the PRD wording.
- No credential or geometry value is written to production logs.

## Findings detail

### [HIGH] Capture-derived QA PNGs and provider images were persisted without credential redaction

- **Location:** incoming defect at `packages/ingest/src/frames/extract-keyframes.ts` and `packages/ingest/src/predraft/run-predraft.ts`; remediation centered at `packages/ingest/src/frames/redaction.ts:22-56`, `packages/ingest/src/frames/extract-keyframes.ts:68-100`, and `packages/ingest/src/pipeline/run-ingest.ts:131`
- **Surface:** PII and logging hygiene
- **Description:** quality correctly found that fixed placeholder telemetry protected structured text but not pixels in the raw capture. ffmpeg extracted and persisted unredacted PNGs, and pre-draft could base64-attach those same images to an AI provider. A visible username, password, or TOTP could therefore leave the machine.
- **Evidence:** before the incoming fix, extraction built argv without a redaction `-vf` and pre-draft read the step asset directly. The existing QA report records the exact pre-fix lines and reachability.
- **Remediation:** capture now persists bounded geometry on every credential input; schemas reject missing/malformed geometry; ingest validates the complete set before creating PNG paths; active boxes become opaque numeric-only ffmpeg `drawbox` filters; and pre-draft requires a reference produced by that extraction run plus canonical project confinement. The real integration creates a visible high-contrast field, extracts via real ffmpeg, decodes every field crop, requires all pixels to be black, and requires provider image bytes to equal a persisted redacted PNG.
- **Status:** fixed by the incoming post-QA remediation and verified in this session.

### [HIGH] Redaction activation used the session clock instead of the video frame-zero anchor

- **Location:** `packages/ingest/src/segment/segment-session.ts:58-67`
- **Surface:** PII and logging hygiene; AI-generated code patterns
- **Description:** the incoming fix described `startRelMs` as video-relative but calculated `event.epochMs - meta.startEpochMs`. MediaRecorder frame zero is independently recorded as `meta.video.anchorEpochMs`. When recording starts after the session, the old calculation activates the drawbox late by that offset and can expose early credential-bearing frames.
- **Evidence:** vulnerable expression: `startRelMs: event.epochMs - meta.startEpochMs`. The integration fixture used equal session/video anchors, so it could not detect the mismatch.
- **Remediation:** activation now uses `Math.max(0, event.epochMs - meta.video.anchorEpochMs)`. A shifted-anchor regression asserts the exact corrected offset, and a pre-anchor event is clamped to zero so protection begins at the first encoded frame.
- **Status:** fixed in this session.

### [HIGH] Session metadata could select an out-of-session local video for extraction and provider upload

- **Location:** `packages/ingest/src/pipeline/session-io.ts:29-48`; use at `:145`
- **Surface:** PII and filesystem hygiene; AI-generated code patterns
- **Description:** `meta.video.filename` was only a non-empty string and was joined to `sessionDir`. A crafted local/shareable session could use traversal to select an arbitrary video outside the session. Ingest would copy it into the project, extract PNGs, and potentially send them to a provider, creating another local-file/PII exfiltration path.
- **Evidence:** vulnerable expression: `const videoPath = path.join(sessionDir, meta.video.filename)` followed only by `existsSync(videoPath)`.
- **Remediation:** `resolveSessionVideo` rejects absolute filenames and lexical traversal, resolves the real session root and candidate, rejects symlink escapes, and returns the contained canonical path. A regression creates an actual outside video and proves metadata traversal is rejected.
- **Status:** fixed in this session.

### [LOW] Studio mutation endpoints rely on loopback binding rather than application authentication

- **Location:** `apps/studio/src/routes/api/credential-markings/+server.ts:43` and `:57`; `packages/cli/src/commands/studio.ts:7` and `:32`
- **Surface:** SvelteKit attack surface; authorization; headers and transport
- **Description:** the route has no session/per-launch token. Safe default loopback binding, JSON preflight/origin checking, and value-free responses limit reachability, but local access, DNS rebinding, or explicit non-loopback binding remain possible. This is the previously recorded workspace Low finding, unchanged by the redaction remediation.
- **Evidence:** handlers use the process-scoped project root without an authentication hook; the CLI exposes `--host` while defaulting to `127.0.0.1`.
- **Remediation:** documented for packaged-Studio hardening: enforce one consistent per-launch token or Host/origin allowlist across all endpoints and select a finite upload limit.
- **Status:** documented for follow-up; non-blocking.

## Remediation summary

| Severity | Count | Fixed this session/incoming fix | Documented only |
|---|---:|---:|---:|
| Critical | 0 | 0 | 0 |
| High | 3 | 3 | 0 |
| Medium | 0 | 0 | 0 |
| Low | 1 | 0 | 1 |

Files changed by this security re-evaluation:

- `packages/ingest/src/segment/segment-session.ts`
- `packages/ingest/test/segment/segment-session.test.ts`
- `packages/ingest/src/pipeline/session-io.ts`
- `packages/ingest/test/pipeline/session-io.test.ts`
- `packages/ingest/test/frames/redaction.test.ts`
- `library/requirements/backlog/prd-009-replay-engine/qa/2026-08-21-security-audit-post-redaction-fix.md`
- `library/requirements/backlog/prd-010-credentials-and-masking/qa/2026-08-21-security-audit-post-redaction-fix.md`
- `library/requirements/backlog/prd-010-credentials-and-masking/qa/canary-leak-test.md`

The replay E2E refreshed the existing PRD-009 drift/native/reframed QA evidence; the two generated JSON manifests were formatted so the final lint gate remains clean. No commit or push was made.

## Re-evaluation

A complete security-stinger pass ran after both High fixes:

- Repeated deterministic secret/history, dynamic-code/HTML, SQL/command/filter, auth/webhook, PII-log, public-env, tracked-secret-file, dependency, lockfile, and CI sweeps. No new Medium-or-above issue remains.
- Reverified geometry value-independence, viewport clipping/full-viewport fail-closed behavior, schema validation, video-anchor timing, DPR/resolution scaling, numeric-only filter grammar, argument-array ffmpeg execution, validation before directory/PNG creation, extractor-ref allowlisting, canonical project/session confinement, and all four earlier High remediations.
- `pnpm audit --audit-level high --json`: 0 Critical, 0 High, 0 Moderate; one Low metadata count without an advisory entry.
- `pnpm lint`: passed, 380 files.
- `pnpm typecheck`: passed across all workspace projects; Svelte reported 0 errors and 0 warnings.
- `pnpm build`: passed.
- `pnpm test`: passed, **764 tests**, 0 failures.
- Targeted redaction/security suite: 4 files, 20 tests, all passed, including the real ffmpeg/provider integration.
- `pnpm --filter @waggle/extension e2e`: passed its real extension registration and seam-injected alignment proof. As the command states, it does not exercise `chrome.tabCapture`; the real ffmpeg integration supplies the pixel-level redaction proof.
- `pnpm --filter @waggle/replay e2e`: passed with real Chromium/ffmpeg and refreshed native/reframed/drift evidence.
- `pnpm --filter @waggle/studio e2e`: passed against the real built loopback server.
- Final canary-artifact scan contains no test canary literal or secret value.

## Next step

The post-redaction joint implementation is **cleared to invoke `quality-stinger` again**. The existing quality report must not be used as final evidence because it predates the remediation and these security fixes. After quality passes, the orchestrator must run `github-repo-health-stinger` before any user-approved commit or push.
