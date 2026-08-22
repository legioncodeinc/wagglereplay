# PRD-018e: Extension handshake, launch, focus, and single instance

> **Waggle** - sub-feature PRD of [PRD-018](./prd-018-desktop-application-index.md)
>
> **Status:** Draft
> **Priority:** P1
> **Effort:** M

## Phase Overview

### Goals

Implement ADR-016's launch path end to end: the extension's "Launch Studio" action health-pings the loopback server, then either focuses the already-running window or asks the OS to open the installed app via the registered `waggle://` scheme. The desktop app enforces single instance so two windows never host two servers.

### Scope

- Desktop: `waggle://` custom protocol registration (Windows, macOS), single-instance lock, second-instance window focus, and `waggle://launch` handling when the app is closed.
- Extension (`apps/extension/src/background/`): action-click flow - health ping with short timeout, then focus-request or protocol open; result feedback on the action badge/tooltip.
- Health-check semantics: the sub-PRD b public endpoint (`{ status, version }`), with a bounded timeout treated as "not running".

### Out of scope

- Linux protocol registration via desktop files (Linux is not a packaged target; document the from-source limitation only).
- Deep links beyond `waggle://launch` (no `waggle://project/x` routing in v1).
- Auto-launching the app at OS login.

### Dependencies

- **Blocks:** sub-PRD f (the recording flow begins from this handshake) and module AC8.
- **Blocked by:** sub-PRD a (shell), sub-PRD b (health endpoint shape, focus-request route).
- **External:** none.

## User Stories

### US-18e.1 - Launch Studio with the app closed

**As a** recorder, **I want** the extension button to start Waggle, **so that** I never open anything myself.

**Acceptance criteria:**
- AC-18e.1.1 Given the app is not running, when the extension action is clicked, then the health ping fails within its timeout and the extension triggers `waggle://launch`, and the OS opens the installed app (Windows and macOS).
- AC-18e.1.2 Given the protocol is unregistered (app uninstalled), when the extension attempts it, then the user sees a clear "install the desktop app" message, not a silent failure.

### US-18e.2 - Focus Studio with the app running

**As a** recorder, **I want** the button to surface the existing window, **so that** I never get a second app.

**Acceptance criteria:**
- AC-18e.2.1 Given the app is running, when the action is clicked, then the health ping succeeds and the extension calls the focus route; the main process brings the existing window to the foreground without creating a window or server.
- AC-18e.2.2 Given a second app instance is somehow launched (user double-clicks while running), then `requestSingleInstanceLock` fails in the second process, it forwards its argv and quits, and the first instance focuses its window.

### US-18e.3 - Reliable "not running" detection

**As a** maintainer, **I want** stale or wedged servers detected honestly, **so that** the button never routes to a dead endpoint.

**Acceptance criteria:**
- AC-18e.3.1 Given the ping does not answer within the timeout, when the flow decides, then it is treated identically to "not running" (protocol path).
- AC-18e.3.2 Given the ping answers but a subsequent focus request fails, when the flow continues, then the extension falls back to the protocol path exactly once and then reports an error state on the action badge.

## Technical Considerations

- **Protocol registration:** `app.setAsDefaultProtocolClient('waggle')` on Windows and macOS in the packaged build; dev runs skip registration. Windows registry-based registration is handled by electron-builder's protocol config (sub-PRD g wires it).
- **Single instance:** `app.requestSingleInstanceLock()` at the earliest main-process point; second instance forwards `process.argv` (where the `waggle://` URL arrives on Windows) and exits. On macOS, `open-url` delivers the URL to the running instance - both paths converge on one handler.
- **Focus route:** authenticated (sub-PRD b token) POST that the main process resolves to window focus - no query-string token (it would leak into logs/OS process lists).
- **Extension side:** all of this lives in the existing MV3 service worker (`apps/extension/src/background/`); no new permissions beyond ADR-018's already-planned `windows`.

## Files Touched

### New files
- `apps/desktop/src/main/protocol.ts` - registration, URL parsing, single allowed link shape
- `apps/desktop/src/main/single-instance.ts` - lock, argv/open-url forwarding, focus
- `apps/extension/src/background/launch-flow.ts` - ping → focus-or-open state machine
- Tests mirroring each

### Modified files
- `apps/desktop/src/main/index.ts` - wire protocol + single-instance handlers into boot order
- `apps/extension/src/background/` action-click handler - delegate to the launch flow
- Sub-PRD g's electron-builder config - declare the protocol for installer registration

## Test Plan

- Unit: launch-flow state machine - ping success/focus, ping failure/open, focus-failure fallback (AC-18e.3.2), protocol-unregistered error (AC-18e.1.2).
- Unit: single-instance argv forwarding and convergence of Windows argv vs macOS open-url paths.
- E2E (real Electron, two launches): second launch exits, first window focuses, exactly one server port bound (AC-18e.2.2).
- Manual matrix (recorded into `qa/`): Windows and macOS packaged builds - closed-app click launches, running-app click focuses, uninstalled-protocol message.

## Risks and Open Questions

- **Risk:** protocol scheme collisions with other installed apps. **Mitigation:** `waggle` is uncommon; failure to register is detected and reported at first run rather than silently broken.
- **Risk:** OS focus-stealing restrictions (macOS focus during other-app fullscreen). **Mitigation:** `app.focus()` + `win.show()` sequence; acceptable imperfection, not a blocker.
- **Open question:** should the focus route also raise a "recording in progress" state response the extension can badge? Defer; ADR-018's stop path does not depend on it.

## Related

- [PRD-018 index](./prd-018-desktop-application-index.md)
- [ADR-016 - launch path this implements](../../../knowledge/private/architecture/ADR-016-studio-packaged-desktop-app.md)
- Sub-PRD b - health endpoint and token the ping/focus calls rely on
