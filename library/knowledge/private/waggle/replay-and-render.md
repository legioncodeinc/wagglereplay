# Replay and render engine

Feeds prd-009, prd-011, prd-012. Local-first per ADR-014; capture mode per ADR-002.

## Playwright facts (v1.62.x, Aug 2026)

- Any viewport/DPR/mobile emulation per context; setViewportSize per page (https://playwright.dev/docs/emulation). CDP allows absurdly large metrics, so every aspect preset is just width x height.
- recordVideo is debug-grade: hardcoded 25 fps VP8 from JPEG screencast frames, single-threaded, no quality API (https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/videoRecorder.ts). Hence ADR-002: Page.startScreencast JPEG frames acked per frame, piped to ffmpeg H.264 (https://chromedevtools.github.io/devtools-protocol/tot/Page/).
- Determinism kit: emulateMedia reducedMotion, injected animation-kill CSS (note animations:'disabled' applies to screenshots only), page.clock for time mocking, waitForLoadState('networkidle') officially DISCOURAGED: per-step element assertions are primary (https://playwright.dev/docs/clock , https://playwright.dev/docs/api/class-page).
- Deterministic frame-stepping upgrade path: Emulation.setVirtualTimePolicy + HeadlessExperimental.beginFrame (experimental) or the JS clock-shim pattern proven by Replit's render engine and WebVideoCreator (https://replit.com/blog/browsers-dont-want-to-be-cameras , https://github.com/Vinlic/WebVideoCreator).
- Playwright Trace (screenshots per action, DOM snapshots, network) is free QA evidence during development (https://playwright.dev/docs/trace-viewer).

## Replay semantics

IR steps map to Playwright: locate via fallback-selector cascade (css, aria, text, xpath, pierce), act, settle (assertion first, network quiescence second, timeout fallback), capture per-step screenshot, continue. Failures mark the step and trigger the self-heal proposal path (prd-011). The synthetic cursor is composited later from the IR cursor trail with spring smoothing; replay moves no visible pointer.

## Smart reframe (ADR-011)

Reframed presets replay at the 16:9 master viewport; the compositor animates a crop window through IR click coordinates and element centers. Output metadata labels native vs reframed.

## Cloud runner profile (optional, prd-012)

Cloudflare findings that shaped ADR-004/014: Browser Run cannot render video (recordVideo unsupported; session recording is rrweb JSON: https://developers.cloudflare.com/browser-run/playwright/); Containers GA with up to 4 vCPU / 12 GiB and R2 FUSE mounting (https://developers.cloudflare.com/changelog/post/2026-04-13-containers-sandbox-ga/ , https://developers.cloudflare.com/containers/pricing/); Workflows for durable orchestration; Queues messages cap at 128 KB so payloads are object keys (https://developers.cloudflare.com/queues/platform/limits/); R2 zero egress (https://developers.cloudflare.com/r2/pricing/). GitHub Actions is the simpler first cloud profile for CI regen on small projects.

## Vision QA loop (prd-011)

After each replay step settles: screenshot + step intent to a fast vision model with a strict verdict schema {matches_intent, anomalies[], confidence}. A 1080p screenshot is ~1,548 tokens on Gemini tiling (https://ai.google.dev/gemini-api/docs/image-understanding); gemini-2.5-flash-lite runs ~$0.0002 per verdict, 3.5-flash-lite ~$0.0005 (https://ai.google.dev/gemini-api/docs/pricing). A 30-step walkthrough QAs for under two cents on the user's own key. Baselines: odiff pixel diffs per step per preset, stored in the project (ADR-005; Argos model reference: https://argos-ci.com/docs/learn/platform-fundamentals/how-argos-detects-visual-differences.md).

## Agentic driving (phase 4 context)

Stagehand v4 is CDP-native and MIT (https://github.com/browserbase/stagehand); Gemini computer-use models are GA (https://ai.google.dev/gemini-api/docs/computer-use); Anthropic computer use remains beta (https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool). Published browser-agent benchmarks sit around 70 to 95 percent under friendly conditions: explorer output stays draft-for-approval (https://www.browserbase.com/blog/evaluating-browser-agents).
