# Capture layer: Chrome MV3 extension

What the recorder can and cannot do, with receipts. Feeds prd-003 and prd-004.

## Recording pipeline

Canonical MV3 tab recording (Chrome 116+): action click (required user gesture) triggers chrome.tabCapture.getMediaStreamId in the service worker; an offscreen document consumes the stream with MediaRecorder (offscreen docs have no lifetime cap; the service worker dies after ~30s idle, so the recorder must NOT live there). Receipts: https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture , https://developer.chrome.com/docs/extensions/reference/api/tabCapture , https://developer.chrome.com/docs/extensions/reference/api/offscreen
Tab audio capture mutes local playback unless re-routed through an AudioContext (tabCapture doc above). Chunked WebM with a MediaRecorder timeslice; buffer to disk, not RAM.

## Clock alignment (the two-clocks trap)

event.timeStamp is relative to each document's time origin; each context (tab, offscreen, worker) has its own. Convert everything to epoch: performance.timeOrigin + event.timeStamp (monotonic, drift-free), anchor video t0 at MediaRecorder.onstart. Receipts: https://developer.mozilla.org/en-US/docs/Web/API/Performance/timeOrigin , https://developer.mozilla.org/en-US/docs/Web/API/Event/timeStamp . webNavigation timeStamps are only internally consistent; do not mix them into the master timeline unconverted.

## Telemetry

Content script (isolated world), capture-phase listeners: click, pointermove sampled ~30 Hz, scroll, input (values masked by default). Per click: multi-fallback selectors (CSS, ARIA, text, XPath, pierce; prefer data-testid), getBoundingClientRect, accessible role and name (https://www.w3.org/TR/accname-1.2/), trimmed innerText, viewport, devicePixelRatio, scroll offsets. Selector strategy mirrors DevTools Recorder: https://developer.chrome.com/docs/devtools/recorder/reference , schema: https://github.com/puppeteer/replay/blob/main/src/Schema.ts

## Routes and state changes

Extension side: chrome.webNavigation onHistoryStateUpdated + onReferenceFragmentUpdated (https://developer.chrome.com/docs/extensions/reference/api/webNavigation). Page side (MAIN world, page CSP applies): patch pushState/replaceState, listen popstate/hashchange, and the Navigation API. Clicks with no route change classify via MutationObserver window: subtree growth or aria-expanded flip near the target = state-change step with DOM delta summary.

## Settle detection

Puppeteer definitions: networkidle0 = 0 connections for 500 ms, networkidle2 = at most 2 (https://pptr.dev/api/puppeteer.puppeteerlifecycleevent). MV3 webRequest observation is intact (blocking is not): per-tab in-flight counter excluding websockets/SSE/beacons (https://developer.chrome.com/docs/extensions/reference/api/webRequest). Record settle markers with source: assertion, network, mutation (ADR-010).

## Hard limits and traps

- chrome.tabs.captureVisibleTab is capped at 2 calls/sec: storyboard frames come from the video in post, never live screenshots (https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab).
- chrome.debugger (needed for Emulation.setDeviceMetricsOverride viewport forcing or Page.startScreencast in-tab) shows a persistent debugging infobar; dismissal detaches the session; suppression needs a launch flag users will not have. Viewport forcing therefore happens at replay, never at capture. Receipts: https://developer.chrome.com/docs/extensions/reference/api/debugger , https://chromium.googlesource.com/chromium/src/+/main/chrome/common/chrome_switches.cc
- Web Store: the debugger permission triggers deep review; tabCapture + webRequest are justifiable. Pre-alpha distributes sideloaded; listing text kept ready (https://developer.chrome.com/docs/webstore/review-process).
- Cap (github.com/CapSoftware/Cap) is AGPL-3.0 outside the MIT cap-camera*/scap-* crates; its commercial license covers their binaries only. Concepts reimplemented clean-room: per-segment cursor.json {moves[], clicks[]} with time_ms, spring-mass-damper cursor smoothing, click-driven auto-zoom segments. Receipts: https://raw.githubusercontent.com/CapSoftware/Cap/main/LICENSE , https://github.com/CapSoftware/Cap/blob/main/crates/project/src/cursor.rs , https://github.com/CapSoftware/Cap/blob/main/crates/rendering/src/cursor_interpolation.rs
- rrweb v2.1.1 (MIT) is a possible future DOM-truth enhancement, not ground truth: canvas off by default, cross-origin iframes unrecordable, assets hot-linked, CSS animations restart on replay (https://github.com/rrweb-io/rrweb/blob/master/guide.md).
