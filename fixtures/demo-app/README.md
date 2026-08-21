# @waggle/fixture-demo-app

A small, dependency-light, deterministic web app served over plain HTTP, used
as the shared test fixture across three PRDs:

- prd-003 (capture extension): AC8's e2e records a 6-step flow against this
  app and checks telemetry aligns to video within 50 ms at each click.
- prd-009 (replay engine): AC6's drift e2e replays the same flow against the
  `moved-button` variant and proves the fallback selector cascade still
  locates the button.
- prd-011 (vision QA and baselines): the seeded-defect QA run uses the
  `broken` variant to prove the QA guards actually catch a real defect.

Node built-ins only for the server (`node:http`), no framework, no bundler.
No external network calls, fonts, or CDN assets. No animations or
transitions. No randomness or clock-dependent rendering. The only
configurable timing is the `/fetch` route's artificial network delay, set
via a query parameter, so every recording and every replay of this app is
byte-for-byte deterministic.

## Usage

```ts
import { startFixtureApp } from '@waggle/fixture-demo-app';

const app = await startFixtureApp(); // variant: 'default', ephemeral port
console.log(app.url); // e.g. "http://127.0.0.1:53214/"

// ... drive a browser against app.url ...

await app.close();
```

`startFixtureApp(options?)` resolves once the server is listening and
returns `{ url, port, variant, close }`. Options:

| Option | Default | Notes |
|---|---|---|
| `variant` | `'default'` | `'default' \| 'moved-button' \| 'broken'`, see below |
| `port` | `0` | `0` binds an OS-assigned ephemeral port |
| `host` | `'127.0.0.1'` | |

All route paths, `data-testid` values, and other constants used below are
exported from the package (`ROUTE_PATHS`, `TEST_IDS`, `ROUTE_ORDER`,
`CTA_START_TEXT`, `DEFAULT_FETCH_DELAY_MS`, `MAX_FETCH_DELAY_MS`,
`FIXTURE_VARIANTS`) so a consumer never has to hardcode a string that could
drift from this README.

## How routing works

This is a client-side routed app (History API `pushState`/`popstate`, no
framework), because prd-003 AC5 needs both halves of route detection to have
something real to detect:

- A full navigation (a typed URL, a link with a real `href`, a reload, or
  a browser back/forward that crosses a page load) is a real HTTP request.
  The server renders the requested route's content server-side, so the
  response body already contains the real, testid-bearing markup for that
  exact route: this is what `webNavigation` observes.
- An in-app transition (clicking a button that calls `history.pushState`)
  never hits the network. The page's own inline script re-renders
  `#app-root` for the new path: this is what history-patch detection
  observes.

Every path other than `/api/data` serves the same self-contained HTML
document (SPA fallback), so a deep link to any route, or to an unmapped
path, always resolves to a real 200 response with real content.

## Routes and test ids

| Route | Path | Route test id | Interactive element test ids |
|---|---|---|---|
| Landing | `/` | `route-landing` | `cta-start` (button; see Variants for the drift case) |
| Login | `/login` | `route-login` | `login-form`, `input-username`, `input-password`, `btn-login` |
| Items | `/items` | `route-items` | `item-list`, `item-1`, `item-2`, `item-3`, `item-detail`, `btn-continue-to-scroll` |
| Scroll | `/scroll` | `route-scroll` | `scroll-region` (plus `scroll-row-0` .. `scroll-row-39` inside it), `btn-continue-to-fetch` |
| Fetch | `/fetch` | `route-fetch` | `fetch-trigger`, `fetch-result`, `btn-continue-to-confirm` |
| Confirm | `/confirm` | `route-confirm` | `confirmation-message` |

Notes on specific routes:

- **Login** has a text input and a password input. Their placeholders are
  `demo-user (not a real credential)` and `demo-pass-0000 (not a real
  credential)`, obviously fake, per ADR-008. Submitting the form (clicking
  `btn-login`, or pressing enter) prevents the default POST and navigates to
  `/items` client-side.
- **Items** is the state-change case: clicking `item-1`, `item-2`, or
  `item-3` updates the text inside `item-detail` in place. There is no route
  change, so this is the one step in the canonical walkthrough that a
  route-based recorder cannot detect; it must be caught as a DOM-mutation
  state change.
- **Scroll** renders 40 rows (`scroll-row-0` through `scroll-row-39`) inside
  a fixed-height, `overflow-y: auto` region 240px tall, so the content
  cannot fit without scrolling.
- **Fetch** is the network-quiescence case. Clicking `fetch-trigger` calls
  `fetch('/api/data?delay=<ms>')`. The delay comes from the `/fetch` route's
  own `?delay=` query parameter (for example `/fetch?delay=500`); if absent
  it defaults to `DEFAULT_FETCH_DELAY_MS` (200 ms), and any value is clamped
  to `MAX_FETCH_DELAY_MS` (5000 ms). `fetch-result` shows `Idle`, then
  `Loading...`, then `Loaded (delay <ms>ms)`, and `btn-continue-to-confirm`
  is disabled until the fetch resolves.
- **Confirm** is a static end state; `confirmation-message` reads
  `Walkthrough complete.`.

## The canonical 6-step walkthrough

This is the exact sequence prd-003 records and prd-009 replays:

1. On `/` (landing), click `cta-start` ("Start Walkthrough"). Navigates to
   `/login` (pushState).
2. On `/login`, fill `input-username` and `input-password`, then click
   `btn-login`. Navigates to `/items` (pushState).
3. On `/items`, click `item-2` (or any item). `item-detail` updates in
   place; no route change (state-change case).
4. Click `btn-continue-to-scroll`. Navigates to `/scroll` (pushState);
   scroll `scroll-region` down (scroll case).
5. Click `btn-continue-to-fetch`. Navigates to `/fetch?delay=<ms>`
   (pushState); click `fetch-trigger` and wait for `fetch-result` to read
   `Loaded (delay <ms>ms)` (network-quiescence case).
6. Click `btn-continue-to-confirm`. Navigates to `/confirm` (pushState);
   `confirmation-message` reads `Walkthrough complete.`.

Six routes, one click (or fill/submit) per route, one state-change step
folded into the items route: this is the "6-step flow" prd-003 AC8 records
and prd-009 AC6 replays for drift detection.

## Variants

`startFixtureApp({ variant })` selects one of three fixed shapes. Every
variant renders the same six routes and the same test ids **except** for
the one documented difference below; nothing else differs, and nothing is
randomized.

### `default`

The baseline walkthrough described above. Every element listed in the route
table keeps its `data-testid`.

### `moved-button` (prd-009 AC6: fallback selector cascade)

On the landing route only: the call-to-action button loses its
`data-testid="cta-start"` attribute entirely, and it is rendered after a
`<footer class="fixture-footer">` element instead of directly inside
`<main>`, so both its DOM position and its selector attribute have changed.
Its accessible role (`button`), its text (`Start Walkthrough`, exported as
`CTA_START_TEXT`), and its click behavior (navigate to `/login`) are
unchanged. A selector strategy that falls back from `data-testid` to
role+accessible-name or to visible text still finds it; a strategy that
only ever looks for `[data-testid="cta-start"]` does not. Every other route
is identical to `default`.

### `broken` (prd-011 seeded-defect QA run)

On the items route only: clicking any item (`item-1`, `item-2`, `item-3`)
logs `fixture-app broken variant: item selection handler failed` to the
console and then throws (a deliberate null-dereference), instead of
updating `item-detail`. The panel stays stuck on its initial text ("Select
an item to see details."), which is the visible defect a QA guard is
expected to catch: the settled screen does not match the step's intent, and
the console carries an error. Every other route, and every other
interaction on the items route (navigating in, clicking
`btn-continue-to-scroll`), is identical to `default`.

The three variants are also differentiated at the HTTP response level, not
just at runtime: the `default` and `moved-button` responses never contain
the broken-variant defect text, and the `broken` response never contains
the `moved-button` footer or the missing-testid button markup. This package's
own test suite (`test/server.test.ts`) asserts exactly that.

## `/api/data`: the network-quiescence endpoint

The only network call this app's own script makes. `GET /api/data?delay=N`
waits `N` milliseconds (clamped to `[0, MAX_FETCH_DELAY_MS]`, default
`DEFAULT_FETCH_DELAY_MS` when `delay` is absent or not a valid number), then
responds `200 application/json` with `{ "value": "settled", "delay": N }`.
Non-`GET`/`HEAD` requests to any path get `405`.

## Development

```sh
pnpm --filter @waggle/fixture-demo-app typecheck
pnpm --filter @waggle/fixture-demo-app test
```
