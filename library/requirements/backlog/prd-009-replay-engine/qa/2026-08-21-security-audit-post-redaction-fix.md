# Security audit - 2026-08-21 - prd-009 post-redaction fix

## Executive summary

- Scope: full re-evaluation of the joint replay/credential tree after the QA-driven capture-frame redaction fix, including capture geometry, video timing, ffmpeg filters, stored QA frames, provider images, session/project paths, replay overlays and values, reports, dependencies, CI, and real E2Es.
- Coverage: **reduced coverage, declared.** This is a local-first Node/Playwright/ffmpeg application rather than the catalog's hosted Neon/WorkOS/Stripe/Vercel stack. All applicable catalog surfaces and the relevant media/filesystem boundaries were checked.
- Findings: **0 Critical, 3 High, 0 Medium, 1 Low.** The incoming fix resolved the unredacted capture-frame/provider High; this pass found and fixed a late-activation clock mismatch and session-video traversal. The Low item is the pre-existing loopback Studio residual.
- Ship Gate status: **cleared to proceed to a fresh quality-stinger pass.** The earlier QA report predates these changes and must be re-run.
- Detailed shared record: `../../prd-010-credentials-and-masking/qa/2026-08-21-security-audit-post-redaction-fix.md` contains the complete evidence and remediation analysis.

## Surface coverage checklist

### SvelteKit attack surface

No redaction change expands Studio's endpoint surface. The value-free marking endpoint remains strict and `no-store`. One known Low residual remains because Studio relies on default loopback binding rather than a per-launch token; no new Medium-or-above issue was detected.

### Authorization and tenancy (Drizzle / Neon)

**Not applicable.** No database or tenant model exists. Filesystem root confinement is enforced for compose project media, pre-draft images, and now ingest session videos.

### Secrets and environment

Capture events retain only a fixed placeholder and field/viewport geometry, never a value or value-derived length. Replay values remain callback-scoped and the public barrel still excludes the binding factory. Secret and history sweeps were clean.

### Webhooks and third-party intake

**None detected / not applicable.** AI pre-draft is outbound only and is covered under PII hygiene.

### Dependencies and supply chain

No dependency was added for the redaction fix. The frozen pnpm lockfile, full-SHA actions, ffmpeg provisioning, and package-name/lock resolution checks passed. `pnpm audit` reports 0 Critical/High/Moderate and one Low metadata count with no advisory object.

### Headers and transport

Studio remains local on `127.0.0.1` by default. The existing loopback/DNS-rebinding residual is Low. Provider requests remain HTTPS and authorization headers are not logged.

### AI-generated code patterns

The incoming fail-closed validation, numeric filter construction, argv-array spawning, extractor-ref allowlisting, and canonical project image confinement are sound. This pass fixed the video-anchor mismatch and unconfined session-video filename. All four High fixes from the initial security report remain present.

### PII and logging hygiene

QA screenshots are now redacted before persistence and only extractor-attested redacted PNGs can reach pre-draft. The real ffmpeg/provider integration proves black field pixels and byte identity between provider images and persisted redacted PNGs. The retained raw source recording is a sensitive local master outside PRD-010's explicit IR/log/QA-screenshot/prompt guarantee; it is not a shareable replay/render output. No credential/geometry production logging was found.

## Findings detail

### [HIGH] Capture-derived QA images could be stored and sent to a provider without pixel redaction

- **Location:** remediation at `packages/ingest/src/frames/redaction.ts:22-56`, `packages/ingest/src/frames/extract-keyframes.ts:68-100`, and `packages/ingest/src/pipeline/run-ingest.ts:131`
- **Surface:** PII and logging hygiene
- **Description:** the pre-fix path protected text telemetry but extracted raw credential pixels directly to project PNGs and provider payloads.
- **Evidence:** the prior extractor had no redaction `-vf`; pre-draft read the resulting asset directly. The existing QA report documents the pre-fix lines.
- **Remediation:** bounded capture geometry, strict event/ingest validation, numeric opaque drawboxes before PNG creation, extractor-ref allowlisting, and a real pixel/provider canary integration.
- **Status:** fixed by the incoming post-QA remediation and verified in this pass.

### [HIGH] Redaction activated against the wrong clock anchor

- **Location:** `packages/ingest/src/segment/segment-session.ts:58-67`
- **Surface:** PII and logging hygiene
- **Description:** activation used session start although ffmpeg timestamps are relative to MediaRecorder's video anchor, permitting late protection when recording started later.
- **Evidence:** pre-fix `event.epochMs - meta.startEpochMs`.
- **Remediation:** now `Math.max(0, event.epochMs - meta.video.anchorEpochMs)`, with offset and pre-anchor regressions.
- **Status:** fixed in this session.

### [HIGH] Session video traversal could select arbitrary local media

- **Location:** `packages/ingest/src/pipeline/session-io.ts:29-48`
- **Surface:** PII and filesystem hygiene
- **Description:** an untrusted `meta.video.filename` could escape `sessionDir`, be copied into the project, extracted, and potentially attached to a provider request.
- **Evidence:** pre-fix `path.join(sessionDir, meta.video.filename)` plus existence check only.
- **Remediation:** absolute, lexical traversal, and canonical/symlink escapes are rejected; a real outside-file regression passes.
- **Status:** fixed in this session.

### [LOW] Studio endpoints rely on loopback binding instead of application authentication

- **Location:** `apps/studio/src/routes/api/credential-markings/+server.ts:43` and `:57`; `packages/cli/src/commands/studio.ts:7` and `:32`
- **Surface:** SvelteKit attack surface; authorization
- **Description:** known local/DNS-rebinding residual, unchanged by this fix.
- **Evidence:** no authorization hook; safe default is explicitly `127.0.0.1`.
- **Remediation:** packaged-Studio follow-up should use one per-launch token or consistent Host/origin allowlist.
- **Status:** documented for follow-up; non-blocking.

## Remediation summary

| Severity | Count | Fixed this session/incoming fix | Documented only |
|---|---:|---:|---:|
| Critical | 0 | 0 | 0 |
| High | 3 | 3 | 0 |
| Medium | 0 | 0 | 0 |
| Low | 1 | 0 | 1 |

Security re-evaluation changes are exactly:

- `packages/ingest/src/segment/segment-session.ts`
- `packages/ingest/test/segment/segment-session.test.ts`
- `packages/ingest/src/pipeline/session-io.ts`
- `packages/ingest/test/pipeline/session-io.test.ts`
- `packages/ingest/test/frames/redaction.test.ts`
- both post-redaction security reports
- the updated value-free canary artifact

No commit or push was made.

## Re-evaluation

Full post-fix results:

- deterministic security sweeps: passed;
- dependency audit: 0 Critical, 0 High, 0 Moderate;
- lint: 380 files passed;
- typecheck: all projects passed, Svelte 0 errors/0 warnings;
- build: passed;
- tests: **764 passed**, 0 failed;
- targeted redaction/session suite: 20/20 passed;
- real ffmpeg/provider canary integration: passed;
- extension alignment E2E: passed, with its documented `chrome.tabCapture` limitation;
- replay Chromium/ffmpeg E2E: passed;
- built Studio E2E: passed;
- earlier replay overlay, callback-only values, compose confinement, and pre-draft confinement fixes: all reverified.

## Next step

The post-redaction implementation is **cleared to invoke `quality-stinger` again**. Once quality passes, the orchestrator must run `github-repo-health-stinger` before any user-approved commit or push.
