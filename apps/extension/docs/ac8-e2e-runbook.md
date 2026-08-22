# AC8 manual verification runbook

`test/e2e/run-alignment-e2e.ts` proves two different things, neither of
which is a genuine automated `chrome.tabCapture` recording end to end. This
document says exactly what each step proves, what it does not, and how a
human with a real display sideloads the extension to close the gap.

## What the automated script actually proves

**STEP A (real-extension-smoke):** launches the built `dist/` extension in
a real, persistent Chromium context (`playwright-core`, headed) with
`--load-extension`/`--disable-extensions-except`, and waits for the MV3
service worker to register. This DID pass in this environment (a
`chrome-extension://.../background.js` service worker registered within
10 seconds), which genuinely proves: the manifest is well-formed, every
requested permission was grantable, and the built `background.js` bundle
loads and runs under a real Chromium as a real unpacked extension. It does
**not** call `chrome.tabCapture.getMediaStreamId` or drive the action
click, and it proves nothing about `MediaRecorder`, the offscreen document,
or telemetry alignment.

**STEP B (seam-injected-alignment, the actual AC8 evidence):** the real,
production-built `dist/content-script.js` bundle - unmodified, the same
bytes a real content-script injection would run - is loaded into a plain
(non-extension) Chromium page against the real fixture app, with only the
`chrome.runtime` messaging channel shimmed (there is no extension host in
this path, so there is nothing else it could talk to). Playwright drives
the real canonical 6-step walkthrough with real synthetic mouse/keyboard
events. For each click, the script compares the real telemetry pipeline's
epoch-converted timestamp (`performance.timeOrigin + event.timeStamp`,
the exact function `lib/epoch.ts` exports and `offscreen/recorder.ts` uses
to anchor the video) against an independent ground truth: Node's own
`Date.now()`, bracketed tightly around the synthetic click dispatch. This
is a genuine, repeatable measurement of whether this pipeline's epoch math
is correct, run against real Chromium, real DOM events, real selector
generation, and the real finalizer - not a fabricated number.

## What it does NOT prove

- That `chrome.tabCapture.getMediaStreamId` succeeds for a real active tab.
- That the offscreen document's `MediaRecorder` actually produces a
  playable WebM, at the right resolution, with audio correctly re-routed
  through `AudioContext`.
- That a click's telemetry timestamp lines up with a specific *decoded
  video frame* of a real recording (STEP B's "video" is a synthetic epoch
  anchor, not a rendered file).
- That the action-click start/stop UX (AC1) or the chunked upload to a
  running Studio server (AC2, AC7) work end to end.

Those require a human, a real display, and (for the upload steps) a
listening Studio server, which now exists: `waggle studio` (prd-005,
merged) boots the built loopback server on `127.0.0.1:4310` with the
session-upload endpoints wired to ingest inputs.

## Manual verification steps

1. `cd apps/extension && pnpm build` (produces `dist/`).
2. Open `chrome://extensions`, enable Developer Mode, "Load unpacked",
   select `apps/extension/dist`.
3. Confirm no manifest/permission warnings beyond what
   `docs/permissions-justification.md` already documents, and that the
   toolbar shows the Waggle action icon.
4. Boot the fixture app locally: from the repo root,
   `node -e "import('@waggle/fixture-demo-app').then(m => m.startFixtureApp({port: 4300}).then(a => console.log(a.url)))"`
   (or run it from a small script - see `fixtures/demo-app/README.md`).
5. Navigate a real tab to the printed fixture URL.
6. Click the Waggle action icon once. Expected: the action badge shows
   "REC"; `chrome://extensions` -> the extension's "service worker" link
   -> Inspect shows console activity (no uncaught errors).
7. Walk the canonical 6-step flow from `fixtures/demo-app/README.md` by
   hand.
8. Click the action icon again to stop. Expected: the badge clears.
9. Studio has shipped (prd-005, merged), so boot it first: from the repo
   root, after `pnpm build`, run `pnpm --filter @waggle/cli start studio
   --project <a waggle project initialized nearby>` in another terminal.
   With Studio listening on `127.0.0.1:4310`, stopping the recording
   should now produce successful uploads: inspect the service worker
   console and confirm the `fetch(...)` calls in `lib/upload-client.ts`
   return non-error responses against `http://127.0.0.1:4310/waggle/...`
   and that the session files land in the project's ingest-input location.
   (If Studio is NOT running, the same fetches fail with exactly
   `ECONNREFUSED`/`Failed to fetch` and nothing else silently swallowed,
   which still confirms the finalizer ran and attempted the real upload
   contract.)
10. To verify tabCapture and MediaRecorder specifically, temporarily add a
    `console.log` in `offscreen/recorder.ts`'s `ondataavailable` handler
    logging `event.data.size`, rebuild, repeat steps 4-8, and confirm the
    offscreen document's console (accessible the same way as the service
    worker's in `chrome://extensions`) logs non-zero chunk sizes at the
    configured timeslice interval.

## Why this split is the honest answer

A fabricated "AC8 passed end to end" would claim a genuine `tabCapture`
recording was captured, played back, and frame-matched against telemetry
in this session. That did not happen: this environment can launch a real,
headed Chromium (STEP A proves that much), but a full tabCapture+MediaRecorder
run needs a foregrounded, audible tab and media-permission auto-grant flags
this script does not attempt, because getting that wrong silently (a
recording that "succeeds" with an empty or black video) would be worse
than not attempting it. STEP B is offered instead as the strongest thing
that CAN be proven automatically: the actual production code that computes
alignment, run for real, measured against an independent clock.
