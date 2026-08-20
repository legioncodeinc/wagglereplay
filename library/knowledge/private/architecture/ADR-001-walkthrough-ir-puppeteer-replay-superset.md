# ADR-001: Walkthrough IR is a strict superset of the Puppeteer Replay schema

Status: Accepted (2026-08-20)

## Context

Every Waggle capability (storyboard, narration timing, replay, re-render, CI regeneration) hangs off one intermediate representation of a recorded walkthrough. The Chrome DevTools Recorder already defines a battle-tested user-flow JSON schema (Puppeteer Replay `Schema.ts`): multi-fallback selectors per element (CSS, ARIA, text, XPath, pierce), click offsets relative to the element box, asserted navigation events, and viewport declarations. Playwright does not natively ingest that format (microsoft/playwright issue 22345, closed unimplemented).

## Decision

Waggle's step core adopts the Puppeteer Replay schema verbatim and extends it with Waggle-namespaced fields: raw cursor trail (time_ms/x/y moves and clicks), recorded viewport and devicePixelRatio, route before/after, step classification (navigate, state-change, input, scroll), DOM deltas for state-change steps, settle metrics, narration segment refs, and asset refs (before frame, click frame, settled frame). IR documents are versioned and immutable; edits create new versions.

## Consequences

Chrome Recorder flows import directly; export to @puppeteer/replay works with extensions stripped; Waggle's replay engine maps steps to Playwright calls itself (small, owned mapping). The extension records selectors DevTools-Recorder style from day one. Cursor trail format is a clean-room reimplementation of the concept in Cap's cursor.json (AGPL code untouched).

## Alternatives Considered

Custom clean schema (max flexibility, no free ecosystem, more spec work). Spike both in prd-002 (delays every dependent PRD for marginal information).
