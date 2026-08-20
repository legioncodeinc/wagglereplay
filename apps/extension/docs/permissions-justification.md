# Permission justification (AC1, ADR-010)

Why `manifest.json` requests each permission. Written for Mario's own
future reference, and ready to paste into a Chrome Web Store listing form
once prd-003's non-goal ("Chrome Web Store listing, later hardening") is
picked up. Pre-alpha distribution is sideloaded (unpacked `dist/`), so
none of this is required for the extension to run today; it exists because
ADR-010 asks for it to be kept ready.

## `tabCapture`

Records the active tab's video and audio via
`chrome.tabCapture.getMediaStreamId`, consumed by the offscreen document's
`MediaRecorder` (AC2). This is the extension's core feature: there is no
walkthrough video without it. Required user gesture: the recording only
starts from `chrome.action.onClicked`, never silently.

## `offscreen`

Creates the offscreen document that hosts `MediaRecorder` (AC2). A MV3
service worker is torn down after roughly 30 seconds idle; a recording
routinely runs longer than that, so the recorder cannot live in the
service worker (corpus: `library/knowledge/private/waggle/capture-layer.md`).
The offscreen document has no visible UI and no lifetime cap.

## `webNavigation`

Listens for `onHistoryStateUpdated` and `onReferenceFragmentUpdated` so a
route change the browser itself recognizes lands in the event stream with
a `source: "webNavigation"` marker (AC5). This is one of three
corroborating route-detection signals (the others are the MAIN-world
history/Navigation API patch and the mutation-window state-change
classifier); it never gates a recording from starting.

## `storage`

Reserved for local extension settings (e.g. the ripple-overlay
enabled/disabled toggle, AC7) that should survive a service-worker
restart. Not used to persist any walkthrough content: per ADR-015, the
project directory on disk is the datastore, and per ADR-008 nothing
secret is ever written anywhere the extension controls.

## `scripting`

Injects the MAIN-world route patch (`route-main-world.js`) into the
active tab only when a recording starts, and reads the recorded viewport
size once at session start (AC5). Never injects into a tab that is not
actively being recorded.

## `webRequest`

Observational only (MV3 removed the blocking variant); powers the
per-tab in-flight request counter behind the `networkidle0`/`networkidle2`
settle heuristic (AC6, ADR-010). Without it, settle detection would fall
back to DOM-mutation quiescence and page-script fetch/XHR patching alone,
which is a materially weaker signal on network-heavy apps - see ADR-010's
Context section for the full tradeoff. This is the permission most likely
to draw review friction on the Chrome Web Store; ADR-010 accepts that cost
because pre-alpha distribution is sideloaded.

## Host permissions (`http://*/*`, `https://*/*`)

Required for the content script (telemetry, AC3) and the MAIN-world route
patch (AC5) to run on whatever app the person is walking through - Waggle
has no fixed set of target sites, so a narrower host pattern would defeat
the product. `chrome.tabCapture` and `chrome.webRequest` do not themselves
need host permissions to observe the active tab.

## What is deliberately NOT requested

- **`debugger`** - would enable `Emulation.setDeviceMetricsOverride`
  (viewport forcing) or `Page.startScreencast`, but shows a persistent,
  undismissable debugging infobar and triggers deep Web Store review.
  Viewport forcing happens at replay (prd-009), never at capture (corpus,
  "Hard limits and traps").
- **`<all_urls>` as a `permissions` entry rather than `host_permissions`** -
  MV3 keeps host access under `host_permissions`, which is the weaker,
  more auditable of the two categories.
- **`identity`, `cookies`, `history`, `bookmarks`** - no capture-layer
  feature needs any of them.
