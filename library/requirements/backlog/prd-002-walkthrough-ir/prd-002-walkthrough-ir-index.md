# prd-002: Walkthrough IR package

Status: backlog | Phase: 1 | Created: 2026-08-20

## 0. Dependencies

Blocking PRDs: prd-001 (workspace + project dirs). Governing ADRs: ADR-001 (Puppeteer Replay superset), ADR-015. Corpus: walkthrough-ir-and-project-format.md.

## Goal

packages/ir: typed schema, validation, versioning, and import/export for the Walkthrough IR. Everything downstream (ingest, studio, narration, replay, compose) consumes this package only.

## Non-goals

Producing IR from recordings (prd-004), replaying it (prd-009).

## Acceptance criteria

Wave 1 (parallel):
- AC1: TypeScript types + zod schemas for the flow, step core (Puppeteer Replay compatible), and the waggle extension keys (cursor trail, viewport, routes, domDelta, settle, element, assets, masked).
- AC2: Validator accepts the documented fixture set (valid flows) and rejects a mutation battery with precise error paths.
- AC3: Chrome Recorder JSON import: bare Recorder exports load as flows with waggle keys defaulted.

Wave 2:
- AC4: Immutable version writer: saving writes walkthrough.v(n+1).json, updates waggle.json pointer, never mutates prior versions (enforced by test).
- AC5: Export strips waggle keys and passes @puppeteer/replay's parse() on all fixtures.
- AC6: Coordinate projection helpers: recorded-viewport px to normalized (0..1) and to any preset viewport, property-tested for round-trip error under 0.5 px.

## Task decomposition (each task 10 minutes or less)

| # | Task | AC | Bee |
|---|---|---|---|
| 1 | Port Puppeteer Replay step/flow types + zod | AC1 | typescript-node-worker-bee |
| 2 | Define waggle extension types + zod | AC1 | typescript-node-worker-bee |
| 3 | Author 5 valid fixtures (navigate, state-change, input, scroll, mixed) | AC2 | quality-worker-bee |
| 4 | Author rejection battery (bad selector arrays, negative times, missing viewport) | AC2 | quality-worker-bee |
| 5 | Recorder-JSON import + defaulting | AC3 | typescript-node-worker-bee |
| 6 | Version writer + manifest pointer update | AC4 | typescript-node-worker-bee |
| 7 | Immutability test (write v2, hash v1 unchanged) | AC4 | quality-worker-bee |
| 8 | Export-strip + @puppeteer/replay parse() round-trip test | AC5 | typescript-node-worker-bee |
| 9 | Projection helpers + fast-check property tests | AC6 | typescript-node-worker-bee |

## QA evidence

qa/ receives schema-coverage notes and the fixture inventory.
