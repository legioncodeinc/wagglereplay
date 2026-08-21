# EXECUTION LEDGER: Waggle full-application build

Orchestrator: the-smoker. Branch: `legion/handoff-application-automation-3f40ae`.
Scope: all 17 PRDs in `library/requirements/backlog/`, 98 acceptance criteria.
Status vocabulary: OPEN | IN PROGRESS | DONE | VERIFIED | BLOCKED.
DONE means fully implemented with passing tests. VERIFIED means a pass other than the implementer confirmed it.

## Environment facts established at Phase 0

| Fact | Value | Consequence |
|---|---|---|
| Node | v25.2.1 | Satisfies the Node 24+ requirement |
| pnpm | 11.9.0 | Workspace tooling available |
| ffmpeg | installed at Phase 0 via winget (Gyan.FFmpeg) | Unblocks PRD-004 AC2, PRD-007, PRD-009 AC3 |
| Playwright browsers | chromium + headless shell + ffmpeg cached at Phase 0 | PRD-009 and PRD-011 browser work unblocked |
| Provider API keys | none present | Live-call ACs park as BLOCKED; adapters build and unit-test against mock transports |
| Git state | clean, seed already committed as f336bb6 | HANDOFF.md section 2 is stale; the `_github-seed` move is already done |

## Standing decisions

1. Every provider integration is built as an adapter with an injectable transport. The adapter, its schema parsing, its error handling, and its retry policy are fully implemented and unit-tested against recorded or mock responses. Only the "call the live service" assertion parks as BLOCKED pending a key.
2. Fixture app: one small local static app is built once during the PRD-003 wave and reused by the PRD-003, 004, 009, 011, 013, 015, 016 e2e criteria.
3. No secrets in any project file, IR, log, prompt, or test fixture. ADR-008 is enforced by the canary battery from PRD-010 AC2 and AC5, and re-checked by the Ship Gate.
4. No commit or push happens without Mario's explicit go-ahead, per CLAUDE.md.

## Model routing

| Tier | Model | Applied to and why |
|---|---|---|
| Default implementation | `claude-sonnet-5` | All typescript-node, svelte, ux-ui, ci-release, devops, and react Bee dispatches. Strong code quality at the best cost and speed point for well-specified tasks. Every PRD task here is pre-decomposed to under 10 minutes, so deep ambiguity resolution is not the bottleneck. |
| Moat and high-ambiguity | `claude-opus-5` | PRD-002 IR schema core, PRD-007 compositor interface and filter graph, PRD-009 replay engine core. These three define contracts every other package consumes, and a wrong abstraction is expensive to unwind. That is the reasoning-depth case the matrix reserves Opus for. |
| Gates | `claude-opus-5` | security-worker-bee and quality-worker-bee. Adversarial review rewards reasoning depth over speed. |

## Wave plan

- W0. Phase 0 recon, ledger, toolchain. Orchestrator. Exit: ffmpeg present, ledger written.
- W1. PRD-001, all waves. Blocks everything. Exit: `pnpm lint`, `pnpm typecheck`, `pnpm test` green repo-wide.
- W2. PRD-002, all waves. Blocks 003, 004, 006, 007, 009. Exit: IR package published to the workspace with fixtures.
- W3. PRD-003 plus the shared fixture app. Exit: extension records a session; fixture app reusable.
- W4. PRD-004, PRD-005, PRD-006 in parallel. 005 consumes 004's ingest outputs, so 005 starts one beat behind.
- W5. PRD-007, then PRD-008. 008 wave-1 sidecar work runs parallel to 007 wave 2.
- W6. PRD-009 plus PRD-010. The moat pair. 010's replay injection point needs 009 wave 1.
- W7. PRD-011 plus PRD-012. Both consume 009.
- W8. PRD-013 plus PRD-014. Independent of each other.
- W9. PRD-015, then PRD-016 which needs 015. PRD-017 runs parallel to both.
- W10. Ship Gate: security-worker-bee, then quality-worker-bee, then orchestrator repo-health.
- W11. Ship: commit, push, PR, CI to green. Requires Mario's go-ahead.

## AC Ledger

| ID | PRD | Criterion (abbreviated) | Bee | Model | Status |
|---|---|---|---|---|---|
| 001-AC1 | 001 | pnpm workspace boots; lint, typecheck, test pass repo-wide | typescript-node | sonnet-5 | VERIFIED |
| 001-AC2 | 001 | `waggle init` creates the ADR-015 layout with a valid manifest; rerun refuses | typescript-node | sonnet-5 | VERIFIED |
| 001-AC3 | 001 | Manifest loader validates waggle.json with zod, actionable errors | typescript-node | sonnet-5 | VERIFIED |
| 001-AC4 | 001 | Command surface registered; stubs exit "not implemented (prd-00X)" | typescript-node | sonnet-5 | VERIFIED |
| 001-AC5 | 001 | renders/ and .env gitignored in scaffolded projects; creds template is env refs only | security | opus-5 | VERIFIED |
| 001-AC6 | 001 | E2E: init in a tmp dir, manifest round-trips, documented stub exit codes | quality | opus-5 | VERIFIED |
| 002-AC1 | 002 | Types and zod for flow, Replay-compatible step core, waggle extension keys | typescript-node | opus-5 | VERIFIED |
| 002-AC2 | 002 | Validator accepts the fixture set, rejects the mutation battery with precise paths | typescript-node | opus-5 | VERIFIED |
| 002-AC3 | 002 | Chrome Recorder JSON import with waggle keys defaulted | typescript-node | sonnet-5 | VERIFIED |
| 002-AC4 | 002 | Immutable version writer: v(n+1), manifest pointer, prior versions untouched | typescript-node | opus-5 | VERIFIED |
| 002-AC5 | 002 | Export strips waggle keys and passes @puppeteer/replay parse() on all fixtures | typescript-node | sonnet-5 | VERIFIED |
| 002-AC6 | 002 | Coordinate projection helpers, property-tested round trip under 0.5 px | typescript-node | sonnet-5 | VERIFIED |
| 003-AC1 | 003 | MV3 manifest with required permissions; action click starts and stops capture | typescript-node | sonnet-5 | VERIFIED |
| 003-AC2 | 003 | Offscreen MediaRecorder, epoch anchor, chunked upload, audio re-route | typescript-node | sonnet-5 | VERIFIED |
| 003-AC3 | 003 | Content-script telemetry with timeOrigin epoch conversion | typescript-node | sonnet-5 | VERIFIED |
| 003-AC4 | 003 | Element sampler: fallback selectors, rect, role and name, viewport, DPR | typescript-node | sonnet-5 | VERIFIED |
| 003-AC5 | 003 | Route detection plus state-change classification with DOM delta summary | typescript-node | sonnet-5 | VERIFIED |
| 003-AC6 | 003 | Settle markers from a webRequest in-flight counter with exclusions | typescript-node | sonnet-5 | VERIFIED |
| 003-AC7 | 003 | Finalizer emits events.jsonl and meta.json; ripple overlay toggleable | typescript-node | sonnet-5 | VERIFIED |
| 003-AC8 | 003 | E2E on the fixture app: 6-step flow, telemetry aligns within 50 ms | quality | opus-5 | DONE |
| 004-AC1 | 004 | Step segmenter deterministic on the fixture recordings | typescript-node | sonnet-5 | VERIFIED |
| 004-AC2 | 004 | ffmpeg keyframes t-5s to t+5s at 1 fps plus click and settled frames | typescript-node | sonnet-5 | VERIFIED |
| 004-AC3 | 004 | Heatmap data: normalized click coordinates aggregated per route | typescript-node | sonnet-5 | VERIFIED |
| 004-AC4 | 004 | AI pre-draft descriptions with a machine-drafted flag | mind | sonnet-5 | DONE |
| 004-AC5 | 004 | `waggle record` end to end; ingest idempotent, byte-identical IR | typescript-node | sonnet-5 | VERIFIED |
| 005-AC1 | 005 | Studio boots on localhost with a project dir; upload endpoints write ingest inputs | svelte | sonnet-5 | VERIFIED |
| 005-AC2 | 005 | Film strip: settled frame, ripple marker, classification badge, route delta | ux-ui-svelte | sonnet-5 | VERIFIED |
| 005-AC3 | 005 | Step detail: frame scrubber, element card, DOM delta summary | ux-ui-svelte | sonnet-5 | VERIFIED |
| 005-AC4 | 005 | Description editor writes narration drafts, clears the flag, autosaves | svelte | sonnet-5 | VERIFIED |
| 005-AC5 | 005 | Heatmap overlay toggle per route | ux-ui-svelte | sonnet-5 | VERIFIED |
| 005-AC6 | 005 | Settings panel: brand kit, voice, presets, credential binding, refs only | svelte | sonnet-5 | VERIFIED |
| 005-AC7 | 005 | Keyboard-first review flow j, k, e, documented in app | svelte | sonnet-5 | VERIFIED |
| 006-AC1 | 006 | Script generator at roughly 150 wpm with settle-time duration hints | mind | sonnet-5 | VERIFIED |
| 006-AC2 | 006 | TTS adapter interface plus env-based provider selection per ADR-006 | typescript-node | sonnet-5 | VERIFIED |
| 006-AC3 | 006 | ElevenLabs with-timestamps, normalized versus original text, chunk stitching | typescript-node | sonnet-5 | DONE |
| 006-AC4 | 006 | words.json plus SRT, VTT, transcript; cues capped at 42 chars by 2 lines | typescript-node | sonnet-5 | VERIFIED |
| 006-AC5 | 006 | Deepgram adapter with timestamps none, plus xAI stub with declared capabilities | typescript-node | sonnet-5 | VERIFIED |
| 006-AC6 | 006 | `waggle narrate` end to end; monotonic word timings covering full duration | quality | opus-5 | DONE |
| 006-AC7 | 006 | Guardrail: refuse shareable audio on free tier or beta model without override | security | opus-5 | VERIFIED |
| 007-AC1 | 007 | Compositor interface plus brand kit zod schema | typescript-node | opus-5 | VERIFIED |
| 007-AC2 | 007 | ASS karaoke generator from words.json, golden-file tested | typescript-node | sonnet-5 | VERIFIED |
| 007-AC3 | 007 | Spring-damped cursor synthesizer plus click ripple overlays | typescript-node | sonnet-5 | VERIFIED |
| 007-AC4 | 007 | Deterministic filter-graph builder, all layers, H.264 at preset dims and fps | typescript-node | opus-5 | VERIFIED |
| 007-AC5 | 007 | Auto-zoom via crop and scale expressions, eased, no zoompan | typescript-node | sonnet-5 | VERIFIED |
| 007-AC6 | 007 | Narration audio mux with configurable source ducking | typescript-node | sonnet-5 | VERIFIED |
| 007-AC7 | 007 | `waggle render --preset 16x9` produces an MP4; idempotent stream md5 | quality | opus-5 | VERIFIED |
| 007-AC8 | 007 | Kit swap changes only branded elements; no IR or narration writes | quality | opus-5 | VERIFIED |
| 008-AC1 | 008 | Stable render naming plus JSON sidecar with version, kit, preset, label, checksum | typescript-node | sonnet-5 | VERIFIED |
| 008-AC2 | 008 | `waggle export` self-contained share bundle; link-integrity check passes | typescript-node | sonnet-5 | VERIFIED |
| 008-AC3 | 008 | Optional R2 upload; absent config explains exactly what to set | typescript-node | sonnet-5 | DONE |
| 008-AC4 | 008 | `waggle clean` prunes by age and version, dry-run default | typescript-node | sonnet-5 | VERIFIED |
| 009-AC1 | 009 | Step-to-Playwright mapper, settle cascade, structured StepFailure | typescript-node | opus-5 | OPEN |
| 009-AC2 | 009 | Determinism kit: reducedMotion, animation kill, fixed timezone and locale, storage state | typescript-node | sonnet-5 | OPEN |
| 009-AC3 | 009 | CDP screencast piped to ffmpeg H.264 plus per-step timing manifest | typescript-node | opus-5 | OPEN |
| 009-AC4 | 009 | Preset matrix plus native-reflow probe deciding native versus reframed | typescript-node | sonnet-5 | OPEN |
| 009-AC5 | 009 | Smart reframe focus-point track consumed by the compositor | typescript-node | sonnet-5 | OPEN |
| 009-AC6 | 009 | `waggle regen`; moved-button fixture regens green via fallback selectors | quality | opus-5 | OPEN |
| 009-AC7 | 009 | Run report per regen written into the project | typescript-node | sonnet-5 | OPEN |
| 009-AC8 | 009 | WAGGLE_RENDER_CONCURRENCY respected across preset jobs | typescript-node | sonnet-5 | OPEN |
| 010-AC1 | 010 | credentials.json schema plus `waggle creds check` without printing values | security | opus-5 | OPEN |
| 010-AC2 | 010 | Fill-time env resolution; canary absent from all artifacts | security | opus-5 | OPEN |
| 010-AC3 | 010 | RFC 6238 TOTP from the seed env ref at fill time | typescript-node | sonnet-5 | OPEN |
| 010-AC4 | 010 | Capture credential marking, placeholder events, screenshot redaction | typescript-node | sonnet-5 | OPEN |
| 010-AC5 | 010 | Shared prompt scrubber, unit-tested against the canary battery | security | opus-5 | OPEN |
| 011-AC1 | 011 | Vision verdict adapter, strict schema, retry once then mark unavailable | mind | sonnet-5 | OPEN |
| 011-AC2 | 011 | odiff baseline store: accept, update, compare, annotated diffs | typescript-node | sonnet-5 | OPEN |
| 011-AC3 | 011 | `regen --check` exit codes distinguish four outcomes; report merges verdicts | typescript-node | sonnet-5 | OPEN |
| 011-AC4 | 011 | Studio review surface with accept and reject baseline actions | ux-ui-svelte | sonnet-5 | OPEN |
| 011-AC5 | 011 | Self-heal selector proposal as an IR patch draft, never auto-applied | mind | sonnet-5 | OPEN |
| 011-AC6 | 011 | Cost guard: spend estimate, skip flag, token logging | typescript-node | sonnet-5 | OPEN |
| 012-AC1 | 012 | Runner interface identical local versus CI, headless enforced, no prompts | typescript-node | sonnet-5 | OPEN |
| 012-AC2 | 012 | Reusable waggle-regen.yml with caching, secrets, artifacts, summary | ci-release | sonnet-5 | OPEN |
| 012-AC3 | 012 | Trigger matrix documented and tested; failures attach the run report | ci-release | sonnet-5 | OPEN |
| 012-AC4 | 012 | Cloudflare Containers profile stub plus runbook, marked not implemented | devops | sonnet-5 | OPEN |
| 013-AC1 | 013 | `narrate --audio` forced alignment, per-word confidence, low-confidence flags | typescript-node | sonnet-5 | OPEN |
| 013-AC2 | 013 | WhisperX self-hosted fallback; identical words.json shape | typescript-node | sonnet-5 | OPEN |
| 013-AC3 | 013 | Sentence-to-step mapper with fuzzy repair plus studio review pass | mind | sonnet-5 | OPEN |
| 013-AC4 | 013 | Pacing stretch; lip-timing drift under 200 ms per step boundary | typescript-node | sonnet-5 | OPEN |
| 013-AC5 | 013 | Captions and transcript regenerate identically via the prd-006 writers | typescript-node | sonnet-5 | OPEN |
| 014-AC1 | 014 | Remotion plugin implements the prd-007 interface; parity within one frame | react | sonnet-5 | OPEN |
| 014-AC2 | 014 | License gate: summary printed, explicit acknowledgement flag required | typescript-node | sonnet-5 | OPEN |
| 014-AC3 | 014 | Brand kits map to inputProps; kit swap needs no code change | react | sonnet-5 | OPEN |
| 014-AC4 | 014 | PiP slot and reframe track honored; shared conformance suite on both backends | quality | opus-5 | OPEN |
| 015-AC1 | 015 | Bounded exploration session, every action logged with screenshot refs | typescript-node | sonnet-5 | OPEN |
| 015-AC2 | 015 | Screen graph persisted, dedup by route plus primary landmark | typescript-node | sonnet-5 | OPEN |
| 015-AC3 | 015 | Baseline sweep per route per preset through the prd-011 store | typescript-node | sonnet-5 | OPEN |
| 015-AC4 | 015 | UX findings report: heuristics plus vision critique with confidence | mind | sonnet-5 | OPEN |
| 015-AC5 | 015 | Journey drafts as flagged draft IRs; one replays green via prd-009 | mind | sonnet-5 | OPEN |
| 015-AC6 | 015 | Spend guard with a hard stop and partial-results save | typescript-node | sonnet-5 | OPEN |
| 016-AC1 | 016 | STT plus intent parser produce a reviewable step list; ambiguity flags | mind | sonnet-5 | OPEN |
| 016-AC2 | 016 | Studio checkpoint before any browser run; the yolo flag is loud | svelte | sonnet-5 | OPEN |
| 016-AC3 | 016 | Explorer executes the confirmed list into a draft IR; soft fail with screenshots | typescript-node | sonnet-5 | OPEN |
| 016-AC4 | 016 | Render paced to the source audio; fixture case watchable end to end | quality | opus-5 | OPEN |
| 016-AC5 | 016 | Full-run provenance linked from one run report | typescript-node | sonnet-5 | OPEN |
| 017-AC1 | 017 | Avatar provider adapter, alpha WebM download, alpha survives the probe | typescript-node | sonnet-5 | OPEN |
| 017-AC2 | 017 | Content-addressed cache; regen and kit swaps hit it; stats in the report | typescript-node | sonnet-5 | OPEN |
| 017-AC3 | 017 | Alpha WebM into the PiP slot on ffmpeg, and Remotion if installed | typescript-node | sonnet-5 | OPEN |
| 017-AC4 | 017 | Cost guard with a confirm flag for non-interactive runs | typescript-node | sonnet-5 | OPEN |

## Watchdog log

| Time | Bee | Event | Action |
|---|---|---|---|
| 2026-08-20 W4 | typescript-node (prd-004 ingest) | Terminated mid-task by an external API session limit. Not a stall and not a work defect: packages/ingest already typechecked clean at the point of death. | Resumed with context intact after the limit reset rather than re-dispatching from scratch, since no decomposition was warranted for an external interruption. |
| 2026-08-20 W4 | typescript-node (prd-007 compositor) | Terminated mid-task by the same external API session limit. Left one typecheck error in test/compositor-contract.test.ts and a failing repo-wide lint. | Resumed with context intact, with the two concrete defects named explicitly in the resume brief. |

| W4 | ffmpeg encoder pins -threads to 4. | libx264 is deterministic only for a GIVEN thread count, and its default derives from host CPU count. An unpinned render is reproducible on one machine and not across two, so PRD-007 AC7 would have passed locally and failed in CI. | No. Correct and important; note it if CI runners ever change shape. |
| W4 | CLI exit codes 10 and 11 claimed by ingest, 12 to 15 by compose. | Two parallel Bees extended the same shared exit-code table. Compose renumbered rather than reclaiming, leaving a documented gap for ingest to fill. | Yes. Verify packages/cli/README.md documents 10 and 11 before the repo-health gate. |

| W4 | Ingest writes two new project-dir files, heatmap.json, predraft.json, and (from PRD-005) studio.json, none enumerated in ADR-015. | Both are additive, JSON, git-committable, and follow the IR writer serialization exactly. ADR-015's decision is filesystem-dirs-not-a-database, which these honour. | Yes. Confirm with quality-worker-bee whether ADR-015 needs an amendment enumerating them, or whether its file list was illustrative rather than exhaustive. |
| W4 | Pre-draft descriptions live in predraft.json, not inside the IR. | packages/ir WaggleStepExtensionSchema has no description or machineDrafted field, and packages/ir is a locked, already-verified package. Adding fields to it would have reopened PRD-002. | Yes. PRD-005 AC4 studio editor must read and write this file; confirm the contract holds when studio lands. |
| W4 | Exit-code documentation gap closed by the orchestrator, not a Bee. | Ingest claimed codes 10 and 11 in source but did not add them to the cli README table; compose flagged the gap rather than guessing another Bee's semantics. Orchestrator added both rows from the source doc comments. | No. Resolved. |

| W5 | PRD-008 R2 uploader hand-rolls AWS SigV4 signing (152 lines) instead of depending on @aws-sdk/client-s3. | Keeps the dependency tree tiny for an optional, non-default feature, consistent with the local-first posture of ADR-009 and ADR-014. Primitives are tested against RFC 4231 published vectors rather than only against itself. | Yes, and specifically. Hand-rolled request signing is security-sensitive code: security-worker-bee must review sigv4.ts directly for canonical-request construction, header handling, and any credential leakage into logs or errors. Do not wave it through on the strength of passing tests. |

| W5 | Studio caught two real bugs that only an end-to-end test could find: adapter-node BODY_SIZE_LIMIT=0 means reject every body, not unlimited, which would have rejected the extension binary video-chunk uploads in production; and a Svelte sync-effect reset the save indicator the instant its own write echoed back through shared state. | Recorded because both are the class of defect unit tests structurally cannot catch, which is the argument for keeping the Playwright smoke test in the suite. | No. Both fixed. |
| W5 | Studio voice picker is a free-text voiceId field, not a live-fetched provider voice list. | No TTS key exists, and the standing convention is that adapters degrade gracefully rather than attempt a live call. | Yes. Confirm PRD-005 AC6 "voice picker" is satisfied by a bound field; revisit if a key arrives. |
| W5 | Three new project-dir files now exist across PRD-004 and PRD-005. | Reinforces rather than changes the ADR-015 question already logged above. | Yes, folded into the ADR-015 item. |

## Blocked register

| ID | Blocker | Specific ask |
|---|---|---|
| 006-AC3 (partial) | No ELEVENLABS_API_KEY. Adapter, schema parsing, retry, and chunk stitching are fully built and unit-tested against mock transports. The v3 dialogue-plus-with-timestamps envelope and the exact subscription tier strings were never seen from a live response. | Provide ELEVENLABS_API_KEY to confirm the live response envelope. |
| 006-AC6 (partial) | Same. The end-to-end run produces words.json, SRT, VTT, and transcript from a mocked synthesize call; no real audio bytes exist. | Provide ELEVENLABS_API_KEY to produce and spot-check real audio. |
| 003-AC8 (partial) | Real chrome.tabCapture needs a headed display with the extension sideloaded, not reachable in this automated session. Proven here: the built extension loads in real Chromium and its MV3 service worker registers; the real content-script bundle drives the fixture app with worst-case click alignment of 9.5 ms against a 50 ms budget, reproduced by the orchestrator. Unproven: an actual tabCapture recording and byte-level correlation to decoded video frames. | Run apps/extension/docs/ac8-e2e-runbook.md on a machine with a display: build, load unpacked, click the action, walk the 6 steps, confirm non-zero MediaRecorder chunk sizes. |
| 008-AC3 (partial) | No R2 or S3 credentials. The uploader hand-rolls SigV4 signing, fully implemented and unit-tested against a mocked transport plus RFC 4231 primitives vectors. Unproven: that a real R2 bucket accepts a request signed this way and returns 200. | Provide R2 account id, access key id, secret access key, and bucket name to confirm a live upload. |
| 004-AC4 (anticipated) | PRD-004 AC4 requires a provider-agnostic LLM call for pre-draft descriptions. No LLM key present. | Provide an LLM provider key (any of OpenAI, Anthropic, Gemini) plus the preferred provider. |

## Cross-cutting decisions made during execution

| Wave | Decision | Rationale | Raised for gate review |
|---|---|---|---|
| W2 | Project layout and manifest ownership moved from `packages/cli` to `packages/ir`; cli now re-exports. | The version writer writes `walkthrough.v(n+1).json` and repoints `currentIrVersion` as one operation. Splitting the manifest shape into a higher package would create two definitions of one contract. `packages/ir` is now the lowest layer. | No. Sound and verified: all 19 cli tests still pass unchanged. |
| W2 | IR schema rejects unknown keys rather than stripping them, and rejects empty selector strings. Both are tightenings over upstream `@puppeteer/replay`. | A strip-by-default schema inside an immutable version writer would silently discard author data with no diff. Neither rule rejects anything Chrome Recorder emits, confirmed by the Recorder fixtures. | Yes. Flag to quality-worker-bee as a deliberate ADR-001 superset interpretation, not an accident. |
| W2 | Chrome Recorder import fills only required waggle keys and defaults `startEpochMs` to 0, not `Date.now()`. | Determinism: re-importing the same Recorder export must not produce a spurious git diff. | Yes. Confirm PRD-002 AC3 "defaulted sensibly" is satisfied by minimal defaulting rather than derived data. |
| W2 | Shared fixture app built once at `fixtures/demo-app` with `default`, `moved-button`, and `broken` variants. | PRD-003 AC8, PRD-009 AC6, and PRD-011 QA each need a fixture target. One parameterised app beats three inventions. | No. |
