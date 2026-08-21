# PRD-018a: Electron shell and hardened renderer

> **Waggle** — sub-feature PRD of [PRD-018](./prd-018-desktop-application-index.md)
>
> **Status:** Draft
> **Priority:** P0 (blocks every other sub-PRD)
> **Effort:** M

## Phase Overview

### Goals

Host the existing Studio loopback server inside an Electron main process and render the existing Svelte Studio UI in a hardened BrowserWindow, so the app opens like any desktop tool with no terminal. Implements the shell decision in ADR-020: the main process is Node and owns the server; the renderer is a pure browser surface. Makes the main/renderer boundary explicit, retiring the standing Vite `node:` builtin warnings instead of normalizing them.

### Scope

- New `apps/desktop` workspace package: Electron main process, preload script, security configuration.
- In-process hosting of the Studio server built by `apps/studio` (SvelteKit `adapter-node` output — today launched as `node build/index.js` per `apps/studio/svelte.config.js`).
- Renderer hardening: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, and a served content security policy.
- A minimal preload bridge (`window.waggleDesktop`) exposing only launch info and the per-launch token accessor (token supplied by sub-PRD b).
- Renderer build audit: no `node:` prefixed imports in browser-bundle output.
- Dev mode: `pnpm --filter @waggle/desktop dev` runs Vite and Electron concurrently with HMR.

### Out of scope

- Loopback authentication, host validation, body limits (sub-PRD b).
- Packaging, installers, resource bundling (sub-PRD g).
- Any UI changes to Studio itself; the Svelte app renders unchanged.

### Dependencies

- **Blocks:** b, c, d, e, f, g (all run inside this shell).
- **Blocked by:** none.
- **External:** Electron (major pinned in `apps/desktop/package.json`); Playwright (already a workspace dependency) for the Electron launch tests via its `_electron` API.

## User Stories

### US-18a.1 — Open Studio without a terminal

**As a** desktop user, **I want to** double-click the Waggle app and see Studio, **so that** I never need a terminal to author walkthroughs.

**Acceptance criteria:**
- AC-18a.1.1 Given the packaged app, when the user opens it, then a BrowserWindow renders the Studio UI served by the loopback server, with no terminal window spawned.
- AC-18a.1.2 Given the main process boots, then the server binds to `127.0.0.1` only, never `0.0.0.0`.
- AC-18a.1.3 Given the packaged app, then the window loads the bundled production build, not a dev-server URL.
- AC-18a.1.4 Given the main process starts, then the pinned Electron major's `process.versions.node` is logged at boot and satisfies the Node 24+ engine floor (hard check lands in sub-PRD g).

### US-18a.2 — Hardened renderer

**As a** maintainer, **I want** the renderer sandboxed with no Node access, **so that** compromised page content cannot reach the filesystem or spawn processes (ADR-020's security consequence).

**Acceptance criteria:**
- AC-18a.2.1 Given the BrowserWindow configuration, then `webPreferences` sets `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, asserted by a unit test over the config object.
- AC-18a.2.2 Given the renderer production bundle, then no module imports a `node:` builtin, asserted by a build-output check that fails the build on any `node:` specifier in browser-side chunks.
- AC-18a.2.3 Given the served Studio HTML, then a content security policy is present whose `connect-src` allows only the loopback origin and whose `default-src` disallows remote origins.
- AC-18a.2.4 Given the window, then `window.waggleDesktop` exposes exactly the documented bridge surface (app info, token accessor) and nothing else, asserted by a preload contract test.

### US-18a.3 — Developer experience parity

**As a** contributor, **I want** `dev` mode with HMR, **so that** Studio UI work against the shell is not a rebuild loop.

**Acceptance criteria:**
- AC-18a.3.1 Given `pnpm --filter @waggle/desktop dev`, then Vite serves Studio and Electron loads the dev URL with hot reload working.
- AC-18a.3.2 Given dev mode, then the same hardening webPreferences apply as production (dev does not silently relax security).

## Technical Considerations

- **Server hosting:** import the adapter-node server output in-process rather than spawning `node build/index.js` as a child — ADR-020's "no sidecar runtime" wording. SvelteKit's adapter-node emits a server entry the desktop main can consume; if the emitted entry cannot be imported cleanly, extract a thin programmatic server entry inside `apps/studio` that both the CLI and the desktop main import. Do not fork the server implementation.
- **Boundary cleanup:** the current Vite build warns on `node:fs`/`node:path` in browser output (HANDOFF-3). Each offending import moves behind a server endpoint or the preload bridge; the warnings' absence becomes a build assertion (AC-18a.2.2), not an aspiration.
- **Electron pin:** pin an exact Electron major; record its embedded Node version; sub-PRD g turns the floor check into a build failure.
- **Window lifecycle:** single window; behavior on close is plain quit (tray/minimize-to-tray are out of scope).
- **Test launcher:** Playwright `_electron` launches the built app in tests — real launch, no mock Electron, per the repo's real-seam testing rule.

## Files Touched

### New files
- `apps/desktop/package.json` — electron dep, scripts (`dev`, `build`, `test`)
- `apps/desktop/src/main/index.ts` — app entry: window, lifecycle, boot order
- `apps/desktop/src/main/server-host.ts` — import and boot the Studio server in-process
- `apps/desktop/src/main/window-config.ts` — hardened `webPreferences` (unit-tested)
- `apps/desktop/src/preload/index.ts` — `contextBridge` surface
- `apps/desktop/test/window-config.test.ts`, `apps/desktop/test/launch.e2e.ts` — config unit test, real Electron launch e2e
- `apps/desktop/scripts/check-renderer-bundle.mjs` — `node:` specifier build assertion

### Modified files
- `apps/studio` — export a programmatic server entry consumable by the desktop main, if adapter-node output cannot be imported directly (no behavior change to `waggle studio`)
- Root `biome.json`/tsconfig references as needed for the new package

## Test Plan

- Unit: `window-config.test.ts` asserts AC-18a.2.1; bridge surface contract test asserts AC-18a.2.4.
- Build: `check-renderer-bundle.mjs` asserts AC-18a.2.2 inside `pnpm build`.
- E2E (`launch.e2e.ts`, real Electron via Playwright): app launches, health endpoint answers on 127.0.0.1 (AC-18a.1.1/2), renderer CSP header observed (AC-18a.2.3), embedded Node logged (AC-18a.1.4).

## Risks and Open Questions

- **Risk:** adapter-node output assumes CLI process env (PORT/HOST). **Mitigation:** server-host passes an explicit port/socket config; never rely on ambient env in the desktop path.
- **Risk:** in-process SvelteKit server and Electron app-signal interactions (e.g., `SIGINT` handling differences). **Mitigation:** explicit shutdown path in main that closes the server before quit.
- **Open question:** which Electron major to pin (embedded Node must satisfy the 24+ floor) — decided in implementation, recorded in `apps/desktop/package.json` and ADR-020's engine-floor consequence.
- **Open question:** whether dev mode needs a separate `NODE_ENV`-gated bridge shim for UI tests that run without Electron — defer until sub-PRD c touches the bridge.

## Related

- [PRD-018 index](./prd-018-desktop-application-index.md)
- [ADR-020 — Electron shell](../../../knowledge/private/architecture/ADR-020-electron-desktop-shell-unsigned-builds.md)
- [ADR-016 — packaged desktop app](../../../knowledge/private/architecture/ADR-016-studio-packaged-desktop-app.md)
