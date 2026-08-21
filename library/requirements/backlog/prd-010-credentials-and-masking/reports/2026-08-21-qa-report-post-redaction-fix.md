# QA Report: prd-010 Credentials and masking, post-redaction fix

**Plan document:** `library/requirements/backlog/prd-010-credentials-and-masking/prd-010-credentials-and-masking-index.md`
**Audit date:** 2026-08-21
**Base branch:** `main` at `6f177d28bb8120a66e84aea09a9e2ab6d2214b9e`
**Head:** `legion/smoker-prd009-prd010` at the same commit, plus the inventoried uncommitted worktree changes
**Auditor:** quality-worker-bee

## Summary

The fresh post-redaction audit passes prd-010: all five acceptance criteria, all seven decomposed tasks, and both non-goals trace to the final post-security implementation and evidence. The prior raw-frame blocker is closed by value-independent bounded geometry, video-anchor activation, validation before output creation, persistent `iw`/`ih`-scaled opaque boxes, extractor-attested provider images, canonical path confinement, and a real ffmpeg/provider canary that proves every stored QA PNG has black field pixels and every provider image is byte-identical to a persisted redacted PNG. No prd-010 Critical, Warning, or Suggestion remains.

## Scorecard

| Category | Status | Notes |
|---|---|---|
| Completeness | ✅ | All 5 ACs, 7 tasks, and 2 non-goals are traced and satisfied, including capture-to-provider pixel redaction. |
| Correctness | ✅ | Reference-only schemas, names-only checks, callback-scoped values, RFC 6238 TOTP, subsequent-recording marking, persistent replay/capture masking, and shared text scrubbing match the plan. |
| Alignment | ✅ | Canonical schema ownership remains in `@waggle/ir`, values resolve only inside replay action callbacks, and Studio/extension/ingest exchange reference and geometry data without values. |
| Gaps | ✅ | Missing or malformed geometry fails before PNG creation; timing, scaling, persistent activation, image attestation, provider-byte identity, and project/session confinement are covered. |
| Detrimental | ✅ | The final tree passed lint on 380 files, all typechecks, build, 764 tests, replay/Studio/extension E2Es, and the real ffmpeg/provider canary; no plan-relative leak or regression remains. |

## Critical Issues (must fix)

None.

## Warnings (should fix)

None.

## Suggestions (consider improving)

None.

## Plan Item Traceability

| # | Plan Requirement | Status | Implementation Location | Notes |
|---|---|---|---|---|
| AC1 | Validate `credentials.json` label, username, secret, TOTP seed references, and selector bindings; `waggle creds check` reports local resolution without values. | ✅ | `packages/ir/src/project/credentials.ts:34-140`; `packages/cli/src/commands/creds.ts:25-144`; `packages/cli/test/creds-check.test.ts:24-158` | Strict schemas reject values, unknown keys, missing refs, ambiguous selectors, and duplicate ids. CLI result objects and output contain env names and booleans only. |
| AC2 | Resolve bound values only at replay act time; values never enter IR, reports, or thrown errors; prove with canaries across artifacts. | ✅ | `packages/replay/src/credentials/binding.ts:143-265`; `packages/replay/src/steps/act.ts:181-196`; `packages/replay/src/steps/replay-step.ts:109-145`; `packages/replay/src/regen/orchestrate.ts:143-155`; `packages/replay/src/capture/timing-manifest.ts:83-133`; `packages/replay/src/report/run-report.ts:84-106`; `packages/replay/test/credentials/binding.test.ts:64-205`; `packages/replay/test/replay-step.test.ts:106-141`; `library/requirements/backlog/prd-010-credentials-and-masking/qa/canary-leak-test.md:1-16` | Environment reads occur inside `actWithValue`; the public replay credentials barrel excludes the binding factory. Failures are scrubbed before manifests/reports, structured capture text is a fixed placeholder, and the final canary artifact truthfully names the media proof. |
| AC3 | Generate RFC 6238 TOTP in-process from the seed env reference at fill time. | ✅ | `packages/replay/src/credentials/totp.ts:24-121`; `packages/replay/src/credentials/binding.ts:205-257`; `packages/replay/test/credentials/totp.test.ts:18-45`; `packages/replay/test/credentials/binding.test.ts:102-109` | Strict Base32 plus SHA-1, SHA-256, and SHA-512 RFC vectors pass; production defaults are 30 seconds, 6 digits, SHA-1, and the seed is read inside the act callback. |
| AC4 | Studio marks credential fields; subsequent recordings store placeholder events; flagged QA screenshots get redaction boxes before storage. | ✅ | `apps/studio/src/lib/components/CredentialMarking.svelte:16-53`; `apps/studio/src/routes/api/credential-markings/+server.ts:43-78`; `apps/extension/src/background/service-worker.ts:124-171`; `apps/extension/src/content/telemetry.ts:135-158`; `apps/extension/src/lib/events.ts:52-78,117-136`; `packages/ingest/src/segment/segment-session.ts:58-70`; `packages/ingest/src/frames/redaction.ts:21-58`; `packages/ingest/src/frames/extract-keyframes.ts:58-100`; `packages/ingest/test/pipeline/credential-redaction.integration.test.ts:62-178` | Studio persists selector roles used only on later capture starts. Credential events retain a fixed placeholder plus bounded field/viewport geometry, never value or length. Ingest activates each box on the video anchor, keeps it active for later frames, validates the full set before creating directories/PNGs, and applies opaque boxes before storage. |
| AC5 | Narration and vision/pre-draft payload builders share a scrubber for flagged values and env names, covered by the canary battery. | ✅ | `packages/ir/src/privacy/scrub.ts:48-67`; `packages/ingest/src/predraft/privacy.ts:43-58`; `packages/ingest/src/predraft/run-predraft.ts:84-109,119-167`; `packages/ingest/src/pipeline/run-ingest.ts:125-132`; `packages/narrate/src/privacy/project-text.ts:42-56`; `packages/narrate/src/narrate/run-narration.ts:80-117,160-188`; `packages/ingest/test/pipeline/credential-redaction.integration.test.ts:157-177`; `library/requirements/backlog/prd-010-credentials-and-masking/qa/canary-leak-test.md:1-16` | Narration and pre-draft wrap the same IR scrubber. Pre-draft accepts only refs attested by the current extraction result and canonically confined to the project; the real integration proves provider images are exact persisted redacted bytes and contain no canary text. |
| T1 | Canonical schema plus credentials check command. | ✅ | `packages/ir/src/project/credentials.ts:34-140`; `packages/cli/src/commands/creds.ts:25-144` | CLI, Studio, and replay consume one reference-only runtime schema. |
| T2 | Environment resolution and fill-time injection. | ✅ | `packages/replay/src/credentials/binding.ts:143-265`; `packages/replay/src/steps/act.ts:181-196`; `packages/replay/src/credentials/index.ts:1-9`; `packages/replay/test/index.test.ts:4-41` | Value-bearing resolution is callback-only and its factory is absent from the public replay credentials barrel. |
| T3 | Canary leak test across artifacts. | ✅ | `library/requirements/backlog/prd-010-credentials-and-masking/qa/canary-leak-test.md:1-16`; `packages/ingest/test/pipeline/credential-redaction.integration.test.ts:62-178`; `packages/replay/test/credentials/binding.test.ts:64-205`; `packages/ingest/test/predraft/run-predraft.test.ts:182-335`; `packages/narrate/test/narrate/run-narration.test.ts:186-271` | The final artifact distinguishes text, callback, real-media, provider, and full-workspace assertions. The audit independently reran the 20-test redaction/session subset successfully. |
| T4 | TOTP generator. | ✅ | `packages/replay/src/credentials/totp.ts:1-121`; `packages/replay/test/credentials/totp.test.ts:18-45` | Strict Base32 decoding, dynamic truncation, and RFC vectors are covered. |
| T5 | Studio credential-field marking UI. | ✅ | `apps/studio/src/lib/components/CredentialMarking.svelte:1-102`; `apps/studio/src/lib/components/StepDetail.svelte:35-45`; `apps/studio/src/lib/server/credentials-store.ts:56-97`; `apps/studio/test/routes/api-endpoints.test.ts:124-171`; `apps/studio/test/lib/state/project-state.svelte.test.ts:1-65` | Markings persist into the bound set's canonical `applies_to` object and update Studio state without exposing resolved values. |
| T6 | Capture placeholder events and screenshot redaction. | ✅ | `apps/extension/src/content/telemetry.ts:135-158`; `apps/extension/src/lib/redaction-geometry.ts:20-54`; `packages/ingest/src/segment/build-steps.ts:164-174`; `packages/ingest/src/segment/segment-session.ts:58-70`; `packages/ingest/src/frames/redaction.ts:26-58`; `packages/ingest/src/frames/extract-keyframes.ts:68-100`; `packages/ingest/test/pipeline/credential-redaction.integration.test.ts:147-176` | The stored event remains placeholder-only. Geometry clips or over-redacts, activation uses `video.anchorEpochMs`, `drawbox` scales through `iw`/`ih`, and real ffmpeg proves every stored QA PNG's field crop is black. |
| T7 | Shared scrubber and battery tests. | ✅ | `packages/ir/src/privacy/scrub.ts:48-67`; `packages/ir/test/privacy-scrub.test.ts:8-47`; `packages/ingest/test/predraft/run-predraft.test.ts:182-335`; `packages/narrate/test/narrate/run-narration.test.ts:186-271`; `packages/ingest/test/pipeline/credential-redaction.integration.test.ts:117-177` | Text artifacts share the literal scrubber; image payloads are separately protected by extractor attestation, redaction, and byte-identity assertions. |
| NG1 | Non-goal: no vault service. | ✅ |, | Honored. Values come from the process environment at action time; no vault client or remote secret store was added. |
| NG2 | Non-goal: no browser password-manager integration. | ✅ |, | Honored. The extension receives selector-role markings and field geometry only and does not use password-manager APIs. |

## Files Changed

- `.env.example` (M), documents blank local credential environment references.
- `EXECUTION_LEDGER.md` (M), adds the joint prd-009/prd-010 execution plan and acceptance rows.
- `apps/extension/src/background/service-worker.ts` (M), fetches active selector-role markings at each capture start.
- `apps/extension/src/content/content-script.ts` (M), forwards capture-start markings into telemetry.
- `apps/extension/src/content/telemetry.ts` (M), emits fixed placeholders plus bounded geometry for explicitly or heuristically credential-marked fields.
- `apps/extension/src/index.ts` (M), exports credential-marking, geometry, and placeholder contracts.
- `apps/extension/src/lib/credential-markings.ts` (A), validates the value-free marking response and exact selector matching.
- `apps/extension/src/lib/events.ts` (M), requires bounded geometry on credential input events and forbids it from carrying values or lengths.
- `apps/extension/src/lib/masking.ts` (M), centralizes the fixed placeholder and heuristic credential classification.
- `apps/extension/src/lib/messaging.ts` (M), adds selector-role markings to capture-start messages.
- `apps/extension/src/lib/redaction-geometry.ts` (A), clips credential rectangles to the recorded viewport and over-redacts degenerate geometry.
- `apps/extension/test/content/telemetry.test.ts` (M), proves marked inputs contain only the placeholder and bounded geometry.
- `apps/extension/test/index.test.ts` (M), updates the extension public-surface expectation.
- `apps/extension/test/lib/credential-markings.test.ts` (A), rejects value-bearing marking responses and tests selector matching.
- `apps/extension/test/lib/masking.test.ts` (M), covers the fixed placeholder contract.
- `apps/extension/test/lib/redaction-geometry.test.ts` (A), covers clipping and full-viewport fail-closed geometry.
- `apps/extension/test/lib/session-finalizer.test.ts` (M), updates finalized credential event expectations for geometry.
- `apps/studio/src/lib/components/CredentialMarking.svelte` (A), adds selector role-marking controls.
- `apps/studio/src/lib/components/StepDetail.svelte` (M), mounts marking controls for change steps.
- `apps/studio/src/lib/schemas/credential-ref.ts` (D), removes the permissive duplicate credential schema.
- `apps/studio/src/lib/server/credentials-store.ts` (M), consumes the canonical schema and atomically persists markings.
- `apps/studio/src/lib/state/project-state.svelte.ts` (M), applies saved markings to client state immediately.
- `apps/studio/src/lib/types.ts` (M), uses canonical credential-set types in project state.
- `apps/studio/src/routes/api/credential-markings/+server.ts` (A), exposes value-free GET and validated marking PUT routes.
- `apps/studio/test/lib/server/credentials-store.test.ts` (M), covers canonical file validation and marking updates.
- `apps/studio/test/lib/state/project-state.svelte.test.ts` (A), covers the runes state marking update.
- `apps/studio/test/routes/api-endpoints.test.ts` (M), covers marking persistence and value-free responses.
- `library/requirements/backlog/prd-010-credentials-and-masking/qa/2026-08-21-security-audit-post-redaction-fix.md` (A), clears the final post-redaction tree for this fresh quality pass.
- `library/requirements/backlog/prd-010-credentials-and-masking/qa/2026-08-21-security-audit.md` (A), records the initial security pass and earlier remediations.
- `library/requirements/backlog/prd-010-credentials-and-masking/qa/canary-leak-test.md` (A), records the final truthful text, callback, media, provider, and workspace canary battery.
- `library/requirements/backlog/prd-010-credentials-and-masking/reports/2026-08-21-qa-report.md` (A), retains the historical blocked snapshot that found the raw-frame defect.
- `packages/cli/README.md` (M), documents credentials checks, environment references, and exit codes.
- `packages/cli/package.json` (M), adds the replay workspace dependency used by regen and credential errors.
- `packages/cli/src/commands/creds.ts` (A), implements names-only `waggle creds check`.
- `packages/cli/src/commands/init.ts` (M), writes the canonical reference-only credential example.
- `packages/cli/src/create-cli.ts` (M), registers `creds check` and regen.
- `packages/cli/src/exit-codes.ts` (M), adds invalid and unresolved credential exit codes.
- `packages/cli/test/creds-check.test.ts` (A), covers schema failures, resolution status, exit codes, and output leaks.
- `packages/cli/test/e2e-init-and-stubs.test.ts` (M), updates init/stub expectations for the real commands and credentials template.
- `packages/ingest/src/frames/extract-keyframes.ts` (M), validates all redactions before output creation and applies active ffmpeg filters before each PNG write.
- `packages/ingest/src/frames/redaction.ts` (A), validates redaction metadata, persists activation, and generates numeric `iw`/`ih` drawbox filters.
- `packages/ingest/src/index.ts` (M), exports the pre-draft privacy and redaction-safe ingest surfaces.
- `packages/ingest/src/pipeline/run-ingest.ts` (M), threads frame redactions and passes only current-extractor-attested image refs to pre-draft.
- `packages/ingest/src/pipeline/session-io.ts` (M), validates events before ingest output and lexically/canonically confines the selected video to the session root.
- `packages/ingest/src/predraft/privacy.ts` (A), wraps the shared scrubber for pre-draft text.
- `packages/ingest/src/predraft/prompt.ts` (M), excludes masked values from text prompt input.
- `packages/ingest/src/predraft/run-predraft.ts` (M), enforces extractor allowlisting, canonical project confinement, and provider/persistence text scrubbing.
- `packages/ingest/src/segment/build-steps.ts` (M), lowers every input to the fixed placeholder and retains the credential flag.
- `packages/ingest/src/segment/segment-session.ts` (M), associates credential geometry with video-anchor-relative persistent activation.
- `packages/ingest/src/segment/types.ts` (M), carries frame-redaction types through segmentation.
- `packages/ingest/test/fixtures/six-step-session/events.jsonl` (M), adds bounded geometry to the credential fixture while retaining fixed placeholders.
- `packages/ingest/test/frames/redaction.test.ts` (A), covers activation persistence, `iw`/`ih` projection, malformed geometry, and filter-injection rejection.
- `packages/ingest/test/pipeline/credential-redaction.integration.test.ts` (A), uses real ffmpeg to prove black pixels for every stored PNG and provider-byte identity.
- `packages/ingest/test/pipeline/session-io.test.ts` (M), covers missing geometry and session-video traversal rejection.
- `packages/ingest/test/predraft/run-predraft.test.ts` (M), covers text canaries, persistence, extractor attestation, and project path confinement.
- `packages/ingest/test/segment/__snapshots__/segment-session.test.ts.snap` (M), updates fixed-placeholder output.
- `packages/ingest/test/segment/group-events.test.ts` (M), updates the masked event fixture.
- `packages/ingest/test/segment/segment-session.test.ts` (M), covers video-anchor timing, pre-anchor clamping, geometry, and placeholder output.
- `packages/ir/src/index.ts` (M), exports canonical credentials and shared privacy APIs.
- `packages/ir/src/privacy/scrub.ts` (A), implements deterministic literal text scrubbing.
- `packages/ir/src/project/credentials.ts` (A), defines the strict reference-only credentials schema.
- `packages/ir/test/credentials-schema.test.ts` (A), covers valid references and schema rejections.
- `packages/ir/test/privacy-scrub.test.ts` (A), covers env names, values, placeholders, canaries, overlaps, and regex literals.
- `packages/narrate/src/index.ts` (M), exports narration privacy helpers.
- `packages/narrate/src/narrate/run-narration.ts` (M), scrubs script, TTS text, transcript, and timed-text source boundaries.
- `packages/narrate/src/privacy/project-text.ts` (A), wraps the shared scrubber for narration text.
- `packages/narrate/test/narrate/run-narration.test.ts` (M), covers TTS input and persisted text artifact canaries.
- `packages/replay/package.json` (M), adds replay credentials/masking dependencies and the real E2E.
- `packages/replay/src/capture/timing-manifest.ts` (A), persists only scrubbed structured failure fields.
- `packages/replay/src/credentials/binding.ts` (A), implements callback-only action-time resolution, selector binding, TOTP, and scrubbed failures.
- `packages/replay/src/credentials/index.ts` (A), exposes safe credential errors and TOTP utilities without the binding factory.
- `packages/replay/src/credentials/totp.ts` (A), implements strict Base32 and RFC 6238 TOTP.
- `packages/replay/src/index.ts` (M), exports the safe credentials/privacy surface with replay orchestration.
- `packages/replay/src/regen/orchestrate.ts` (A), creates project credential bindings internally for production regen.
- `packages/replay/src/report/run-report.ts` (A), projects scrubbed step failures into project run reports.
- `packages/replay/src/security/credential-scrub.ts` (A), scrubs resolved values and env names from action-time errors.
- `packages/replay/src/session/replay-session.ts` (A), threads callback resolution, failure scrubbing, and credential-step marking into execution.
- `packages/replay/src/steps/act.ts` (A), performs credential fill only inside the callback boundary.
- `packages/replay/src/steps/replay-step.ts` (A), installs a persistent opaque overlay before fill and keeps it through screenshot and screencast frames.
- `packages/replay/src/steps/step-failure.ts` (A), defines the report-safe structured failure contract.
- `packages/replay/test/credentials/binding.test.ts` (A), covers lazy environment reads, callback scope, TOTP, ambiguity, and canary errors.
- `packages/replay/test/credentials/totp.test.ts` (A), covers RFC vectors and strict Base32 behavior.
- `packages/replay/test/index.test.ts` (M), verifies the public surface does not expose the resolver factory.
- `packages/replay/test/replay-step.test.ts` (A), covers canary errors and persistent overlay ordering through fill and screenshot.
- `packages/replay/tsconfig.json` (M), enables DOM types required by replay browser callbacks.
- `pnpm-lock.yaml` (M), records workspace links and resolved replay tooling.
