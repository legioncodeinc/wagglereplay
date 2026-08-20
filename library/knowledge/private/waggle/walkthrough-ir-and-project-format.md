# Walkthrough IR and project format

Feeds prd-001 and prd-002. Governed by ADR-001 (schema) and ADR-015 (filesystem).

## Project directory (the datastore)

```text
my-demo/
  waggle.json              project manifest: name, current IR version, presets, defaults
  walkthrough.v3.json      immutable IR versions (v1, v2, ...)
  steps/                   per-step frame assets (before, click, settled) by IR version
  narration/               script.md, segments.json, audio.mp3, words.json, captions.srt/.vtt, transcript.txt
  brand/                   kit config files: colors, logo path, watermark, cursor style, intro/outro
  baselines/               odiff-accepted screenshot sets per preset
  credentials.json         env REFS only, never values (ADR-008)
  renders/                 output MP4s and share bundles (gitignored)
```

Everything except renders/ and heavy media is committable; regeneration in CI needs only the repo plus env keys.

## IR shape

Step core is the Puppeteer Replay schema (https://github.com/puppeteer/replay/blob/main/src/Schema.ts): type, target frame, multi-fallback selectors[], offsetX/offsetY, assertedEvents, plus flow-level title/timeout/selectorAttribute and setViewport steps. Waggle extensions live under a "waggle" key per step and flow:

- flow.waggle: schemaVersion, recordedViewport {w,h,dpr}, userAgent, startEpochMs, cursorTrail [{t,x,y}], clicks [{t,x,y,down}], sourceRecording {videoRef, durationMs}
- step.waggle: classification (navigate | state-change | input | scroll), routeBefore/routeAfter, domDelta {summary, ariaChanges[], rectDelta}, settle {source, ms}, element {role, name, text, rect}, narrationSegmentId, assets {before, click, settled}, masked (bool)

Rules: IR versions are immutable files; edits write v(n+1) and update waggle.json. Chrome Recorder JSON imports as a bare flow (extensions absent). Export strips the waggle key for @puppeteer/replay compatibility. Playwright ingestion is Waggle's own step-to-Playwright mapping (Playwright will not read this format natively: https://github.com/microsoft/playwright/issues/22345).

## Numbering and time

All times are ms relative to flow.startEpochMs (which is absolute epoch). Coordinates are stored in recorded-viewport CSS pixels plus normalized (0..1) form so any preset can re-project them.
