# Canary leak test

| Command / test name | Pass/fail assertion | Result |
|---|---|---|
| `pnpm --filter @waggle/ir exec vitest run test/privacy-scrub.test.ts test/credentials-schema.test.ts` | Shared scrubber and reference-only credential schema assertions pass. | PASS |
| `pnpm --filter @waggle/replay exec vitest run test/credentials/binding.test.ts test/replay-step.test.ts` | Values remain inside the act callback; failures, reports, video frames, and screenshots do not expose them. | PASS |
| `pnpm --filter @waggle/ingest exec vitest run test/predraft/run-predraft.test.ts` | Provider requests, generated output, persisted pre-draft output, and out-of-project image references contain no flagged material. | PASS |
| `pnpm --filter @waggle/narrate exec vitest run test/guardrails/shareable-audio.test.ts test/narrate/run-narration.test.ts` | Narration/provider payload and shareable-audio guardrail assertions contain no flagged material. | PASS |
| `pnpm --filter @waggle/cli exec vitest run test/creds-check.test.ts` | Credential checks report reference resolution without printing values. | PASS |
| `pnpm --filter @waggle/extension exec vitest run test/lib/credential-markings.test.ts test/content/telemetry.test.ts` | Marked capture events contain fixed placeholders rather than typed values. | PASS |
| `pnpm --filter @waggle/ingest exec vitest run test/pipeline/credential-redaction.integration.test.ts` | An explicitly marked field becomes a validated credential event with bounded geometry; real ffmpeg extraction scales and applies an opaque box before every PNG write; all pixels in the field crop are black; the mocked pre-draft request contains only the exact persisted, redacted PNG bytes and no canary text. | PASS |
| `pnpm --filter @waggle/studio exec vitest run test/routes/api-endpoints.test.ts test/lib/state/project-state.svelte.test.ts` | Studio marking/bootstrap responses and browser state contain selector roles only, never resolved values. | PASS |
| `pnpm --filter @waggle/extension e2e` | Real extension registration and seam-injected capture-timeline alignment assertions pass; tab-capture media remains the documented manual boundary. | PASS |
| `pnpm test` | Full workspace leak/regression battery passes with 764 tests and no failures. | PASS |
| `pnpm --filter @waggle/replay e2e` | Real Chromium/ffmpeg replay artifacts pass redaction and drift assertions. | PASS |

The capture-to-ingest canary uses a synthetic high-contrast field region and a test-only text canary held only in test memory. The report intentionally does not reproduce that text. Credential input geometry is clipped to the recorded CSS viewport during capture, validated again at the ingest boundary, associated with its video-relative activation time, and projected to decoded frame dimensions through ffmpeg `iw`/`ih`. Missing, zero-size, non-finite, or out-of-bounds persisted geometry fails before frame extraction creates a PNG. Pre-draft image loading is allowlisted to the frame references returned by the same ingest extraction run, so it cannot read an arbitrary project image.
