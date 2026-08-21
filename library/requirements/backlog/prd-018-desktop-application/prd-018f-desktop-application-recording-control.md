# PRD-018f: Recording control flow — countdown, overlay, stop, auto-processing

> **Waggle** — sub-feature PRD of [PRD-018](./prd-018-desktop-application-index.md)
>
> **Status:** Draft
> **Priority:** P1
> **Effort:** L

## Phase Overview

### Goals

Implement ADR-018's recording UX on top of the existing prd-003 capture pipeline: a pre-roll countdown that is never captured, a draggable recording control rendered outside the recorded tab's DOM (documentPictureInPicture with a popup-window fallback), a stop path that always works (second action-icon click), and automatic processing the moment recording stops — no terminal anywhere in the flow.

### Scope

- Countdown surface in the same excluded window as the control; `MediaRecorder` capture start deferred until the countdown completes.
- Recording control (drag handle, stop) in a documentPictureInPicture window where the installed Chrome supports it, else a `chrome.windows.create` popup; custom drag region for OS-window dragging.
- Stop convergence: action-icon second click, control stop button, and control-window close all funnel into one stop path that triggers processing.
- Automatic processing on stop through the existing ingest pipeline seam (prd-004), with progress surfaced on the desktop recordings page (sub-PRD d's list).
- Manifest: the `windows` permission ADR-018 adds ships here.

### Out of scope

- Pause/resume (ADR-018 names drag, pause, stop for the control; pause defers to a follow-up — see Open Questions).
- Any change to capture encoding, quiescence, or event telemetry (prd-003/ADR-010 contracts frozen).
- Studio-side render/narration orchestration changes; processing = the existing pipeline invoked automatically.

### Dependencies

- **Blocks:** module AC8.
- **Blocked by:** sub-PRD e (the flow starts from the extension action), sub-PRD a/b (desktop side hosts processing status), d (recordings list shows progress/result).
- **External:** Chrome `documentPictureInPicture` availability; `chrome.tabCapture`/MediaRecorder as shipped by prd-003.

## User Stories

### US-18f.1 — Countdown without capture

**As a** recorder, **I want** a visible countdown before capture starts, **so that** I can get my hand off the mouse and the video never starts mid-gesture.

**Acceptance criteria:**
- AC-18f.1.1 Given recording is initiated, when the countdown runs, then capture start (`MediaRecorder.start`) is deferred until the countdown completes; the countdown surface is the excluded window, never the recorded tab.
- AC-18f.1.2 Given the countdown, when the user cancels, then no capture file is created and the session state resets.

### US-18f.2 — A control that is never in the pixels and never in the events

**As a** recorder, **I want** to move the control out of the way freely, **so that** my video stays clean and my click stream stays truthful.

**Acceptance criteria:**
- AC-18f.2.1 Given recording with the control open, when the master video is inspected, then the control and its drag ghost appear in no frame (PiP/popup surface excluded by construction — asserted on a real capture).
- AC-18f.2.2 Given dragging the control, when the event stream is reviewed, then no drag-related pointer events exist in `events.jsonl` (separate window/document, per ADR-018).
- AC-18f.2.3 Given a Chrome without `documentPictureInPicture`, when the flow starts, then the popup fallback opens automatically and AC-18f.2.1/2.2 still hold.

### US-18f.3 — Stop always works

**As a** recorder, **I want** one guaranteed stop, **so that** a broken overlay can never trap me in a recording.

**Acceptance criteria:**
- AC-18f.3.1 Given a recording in any overlay state (visible, dragged, closed, crashed), when the extension action icon is clicked a second time, then recording stops and processing is triggered through the same path as the control's stop button.
- AC-18f.3.2 Given stop, when it runs, then the capture file is finalized, the overlay surfaces are torn down, and the extension badge returns to idle.

### US-18f.4 — Processing happens by itself

**As a** user, **I want** the recording to become a walkthrough without commands, **so that** the zero-terminal promise holds through the end of the flow.

**Acceptance criteria:**
- AC-18f.4.1 Given a stopped recording, when processing triggers, then ingest runs automatically against the existing pipeline and the recordings page shows live progress to a finished draft.
- AC-18f.4.2 Given processing failure, when it is reported, then the recordings page shows the failure reason from the structured pipeline error — no terminal required to diagnose.
- AC-18f.4.3 Given the whole flow (click → countdown → record → stop), then no step opens a terminal or requires one.

## Technical Considerations

- **Surface strategy per ADR-018:** `documentPictureInPicture` when available; otherwise `chrome.windows.create({ type: 'popup', focused: false })` positioned over the tab. The decision is feature-detected per recording session, not cached across Chrome upgrades.
- **Drag:** OS-window drag via `-webkit-app-region: drag` equivalents in the PiP document plus a manual pointer-based drag for the popup window (`chrome.windows.update` position). Drag events stay in the excluded document — the recorded tab's listeners never see them (ADR-018's core property; the test asserts it rather than trusting it).
- **Stop convergence:** one `stopSession()` in the service worker; action-icon click, control button, and PiP window close all call it; idempotent so double-invocation is safe.
- **Processing trigger:** the existing extension→Studio upload/ingest seam from prd-003/prd-004, now invoked automatically on stop instead of waiting for a command; token-authenticated per sub-PRD b.
- **Manifest:** add `windows` permission alongside ADR-010's existing set; ADR-018 documents this addition shipping with the decision.

## Files Touched

### New files
- `apps/extension/src/background/recording-session.ts` — state machine: armed → countdown → capturing → stopped → processing
- `apps/extension/src/offscreen/` (or content) countdown/control document for the PiP/popup surface
- `apps/extension/src/lib/control-window.ts` — surface selection, creation, teardown
- Tests mirroring each, plus one real-Chromium capture e2e

### Modified files
- `apps/extension/manifest.json` — `windows` permission (ADR-018)
- `apps/extension/src/background/` action handler — second-click stop path (AC-18f.3.1)
- `apps/studio` recordings page (sub-PRD d surface) — progress/failure states (AC-18f.4.1/2)

## Test Plan

- Unit: session state machine — countdown cancel (AC-18f.1.2), stop idempotence (AC-18f.3), fallback selection (AC-18f.2.3).
- E2E (real Chromium + real ffmpeg, per the repo's real-seam rule): record the fixture app with the control visible and dragged; assert (a) no control pixels in any extracted frame of the master (AC-18f.2.1) and (b) zero drag events in `events.jsonl` (AC-18f.2.2); stop-via-action-icon path exercised with the control closed (AC-18f.3.1).
- E2E: stop → processing runs → recordings page shows the finished draft (AC-18f.4.1) with a seeded pipeline failure showing its structured reason (AC-18f.4.2).
- Manual (into `qa/`): the headed `chrome.tabCapture` chooser flow HANDOFF-3 requires — full flow with the toolbar click, both surfaces.

## Risks and Open Questions

- **Risk:** `documentPictureInPicture` Chrome-version floor on users' machines. **Mitigation:** feature detection with the popup fallback; both surfaces tested.
- **Risk:** PiP window close during capture could read as "stop" prematurely. **Mitigation:** PiP close triggers stop through the converged path deliberately (defined behavior), never silently discards.
- **Open question:** pause/resume scope — ADR-018 names pause on the control. Recommend shipping drag+stop first (pause touches MediaRecorder timeslice semantics); pause becomes a small follow-up issue, not a PRD change.
- **Open question:** countdown length and cancellability from the control (recommended: 3s, cancel in control and via action icon).

## Related

- [PRD-018 index](./prd-018-desktop-application-index.md)
- [ADR-018 — recording UX this implements](../../../knowledge/private/architecture/ADR-018-extension-driven-recording-ux.md)
- [ADR-002 — synthetic elements never in raw capture](../../../knowledge/private/architecture/ADR-002-replay-capture-cdp-screencast-to-ffmpeg.md)
