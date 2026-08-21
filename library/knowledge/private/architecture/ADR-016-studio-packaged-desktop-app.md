# ADR-016: Studio ships as a packaged desktop app; the extension cannot spawn it

Status: Accepted (2026-08-21)

## Context

Waggle's zero-terminal mandate requires every step from install to a finished render to happen without opening a terminal. Studio needs Node for ffmpeg (ADR-003), the filesystem project directory format (ADR-015), and Playwright's Chromium. A Chrome MV3 extension has none of that access: its service worker runs in a sandboxed V8 isolate with no Node bindings and no child_process, and the chrome.* surface it already holds (tabCapture, offscreen, webNavigation, storage, scripting, webRequest per ADR-010) has no API to launch or manage an OS process. An extension alone cannot start Studio's local server; something else has to already be running for the extension to talk to.

## Decision

Studio ships as a packaged desktop application (Tauri or Electron; the framework choice is left to the implementing PRD) that the user installs once, the same way any other desktop tool is installed. The desktop app hosts the local Node runtime and the localhost server the extension already talks to per ADR-014. The extension's "Launch Studio" button does not spawn anything: it pings the local server's health endpoint, then either focuses the already-running Studio window (via the OS window-focus path the desktop framework exposes) or triggers the OS to open the installed app (a registered custom URI scheme, for example waggle://launch) if no instance is running. The recordings list and provider-key entry (ADR-017) live inside this same desktop-hosted page.

## Consequences

Zero-terminal install and launch for the primary path; a single installed binary owns the Node runtime the extension can never have. It adds a full cross-platform packaging surface that did not exist before: code signing and notarization on macOS, an installer on Windows, an update channel, and a URI-scheme registration step per platform. Distribution needs an installer that also registers the extension where the platform allows it; until that lands, sideloading (ADR-010) is the only way to run any of this.

## Alternatives Considered

Native messaging host (chrome.runtime.connectNative can spawn a registered local process without a full GUI shell). Rejected as the primary path: it still requires a manifest-file install step per OS, and it has no natural home for the "page opens in the browser listing recordings, with fields for provider API keys" requirement, since native messaging hosts are headless processes, not web UIs. Cloud-hosted Studio, where the extension talks to a hosted service instead of localhost. Rejected outright: it reintroduces the cloud dependency ADR-014 exists to avoid, for a personal tool with no tenancy.

## Supersession and interaction

Reinforces ADR-014 and ADR-015 rather than superseding either: the desktop app is still a single local process, projects still live on disk, nothing here adds a server-of-record or a database. It makes concrete the "local studio server on localhost" ADR-014 already named, by specifying who launches it and how the extension reaches it.
