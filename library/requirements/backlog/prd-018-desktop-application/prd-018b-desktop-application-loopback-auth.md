# PRD-018b: Per-launch loopback authentication and request guards

> **Waggle** — sub-feature PRD of [PRD-018](./prd-018-desktop-application-index.md)
>
> **Status:** Draft
> **Priority:** P0 (closes the standing security finding)
> **Effort:** M

## Phase Overview

### Goals

Close the one remaining Low security finding: the Studio loopback server has no per-launch authentication. Add a per-launch random token required by every API route, validate the Host header against the loopback interface, and bound request bodies. This is mandatory before packaged distribution because packaging is distribution (HANDOFF-3, ADR-020).

### Scope

- Token generation in the desktop main process at every launch (`crypto.randomBytes`, rotated per launch, never persisted).
- Auth middleware in the Studio server: every route except the minimal health endpoint requires the token; constant-time comparison.
- Token delivery to the renderer via the sub-PRD a preload bridge.
- Token delivery to the extension via an origin-pinned handshake endpoint (see Technical Considerations).
- Host header validation (only `127.0.0.1`/`localhost` with the launched port — DNS-rebinding deterrence) and a request body size cap.
- The health endpoint exposes status and app version only — no route inventory, no token echo.

### Out of scope

- TLS (loopback does not need it; token + host validation are the controls).
- Multi-user or remote access — explicitly never (ADR-014/ADR-016).
- Rate limiting (no threat model on a single-user loopback with a token).

### Dependencies

- **Blocks:** c, d, e, f (their renderer/extension API calls ride on the token).
- **Blocked by:** sub-PRD a (shell and preload bridge).
- **External:** none.

## User Stories

### US-18b.1 — Unauthenticated requests are rejected

**As a** user running Waggle on a shared machine, **I want** any process that lacks the launch token to be unable to drive the Studio API, **so that** other local users or pages cannot read my projects or trigger renders.

**Acceptance criteria:**
- AC-18b.1.1 Given the server is running, when a request hits any API route without a token, then the server responds `401` and the request is logged without echoing the token.
- AC-18b.1.2 Given a wrong token, when a request is made, then the response is `401` and indistinguishable from a missing token.
- AC-18b.1.3 Given the health endpoint, when pinged without a token, then it answers `200` with `{ status, version }` and nothing else.
- AC-18b.1.4 Given two consecutive app launches, then the tokens differ (rotation asserted in test).

### US-18b.2 — The renderer session works transparently

**As a** desktop user, **I want** the Studio UI to just work, **so that** authentication is invisible inside the app.

**Acceptance criteria:**
- AC-18b.2.1 Given the renderer, when any Studio API call is made, then the client library attaches the token from `window.waggleDesktop` as an authorization header without UI involvement.
- AC-18b.2.2 Given the preload bridge is unavailable (plain browser without Electron), then the client surfaces a clear "desktop app required" error rather than silent 401 loops.

### US-18b.3 — The extension obtains the token without user steps

**As a** recorder, **I want** the extension to authenticate to Studio automatically, **so that** zero-terminal holds on the capture path too.

**Acceptance criteria:**
- AC-18b.3.1 Given a request to the handshake endpoint, when the `Origin` is the installed extension's `chrome-extension://<id>`, then the server returns the launch token.
- AC-18b.3.2 Given any other origin (http pages, other extensions), when the handshake is attempted, then the server responds `403` and does not reveal whether the app is running beyond the health endpoint's public status.
- AC-18b.3.3 Given the extension holds a token from a previous launch, when the app relaunches, then the stale token fails with `401` and the extension transparently re-handshakes once.

### US-18b.4 — Host and body guards

**As a** maintainer, **I want** rebinding-style requests and oversized bodies rejected, **so that** the loopback boundary cannot be abused as a pivot.

**Acceptance criteria:**
- AC-18b.4.1 Given a request whose `Host` header is not `127.0.0.1:<port>` or `localhost:<port>`, when it arrives, then the server responds `403` before route handling.
- AC-18b.4.2 Given a request body exceeding the configured cap, when it is sent, then the server responds `413` and the connection is dropped.
- AC-18b.4.3 Given the cap, then it is a named config constant documented against the largest legitimate payload (recording upload), with a comment tying it to prd-013's audio alignment work.

## Technical Considerations

- **Token bootstrap for the extension** is the one genuinely open design point. The origin-pinned handshake is the primary mechanism: a packed extension has a stable `chrome-extension://<id>` origin, DNS-rebinding pages cannot present that origin, and ordinary web pages have different origins. The packed extension id must therefore be fixed via the manifest key, and the server's allowlist is that single id. Alternative (token file in app-data readable via a companion mechanism) is rejected because MV3 extensions cannot read arbitrary local files. security-worker-bee reviews this design at the Ship Gate before it merges.
- **Middleware placement:** the guards live in `apps/studio/src/lib/server/` so both the Electron-hosted and `waggle studio` CLI paths get them. The CLI path generates its own token and prints it once on boot (or honors `WAGGLE_STUDIO_TOKEN`); the frozen command surface is unchanged (ADR-019).
- **Constant-time compare** for token checks; tokens never appear in logs, error bodies, or the run reports (extends the PRD-010 no-secrets contract; add the launch token to the canary battery's forbidden-strings list).
- **CORS:** allow only the extension origin on the handshake route; no wildcard CORS anywhere.

## Files Touched

### New files
- `apps/desktop/src/main/launch-token.ts` — generation and IPC exposure
- `apps/studio/src/lib/server/auth-middleware.ts` — token check, constant-time compare
- `apps/studio/src/lib/server/host-guard.ts` — Host validation + body cap wiring
- `apps/studio/src/lib/server/handshake.ts` — origin-pinned token issuance
- Tests mirroring each file under `apps/studio/test/` and `apps/desktop/test/`

### Modified files
- `apps/studio/src/lib/server/` — register middleware ahead of existing routes; health endpoint narrowed to `{ status, version }`
- `apps/studio/src/lib/` client layer — token header attachment from the bridge (AC-18b.2)
- `apps/extension/src/background/` — handshake call and stale-token re-handshake (AC-18b.3.3)
- PRD-010 canary battery fixture list — add the launch token string

## Test Plan

- Unit: middleware matrix — missing token, wrong token, valid token, health exemption (AC-18b.1.1–3); rotation test (AC-18b.1.4); host matrix (AC-18b.4.1); body cap (AC-18b.4.2).
- Unit: handshake origin matrix — extension origin, https page, other extension (AC-18b.3.1/2).
- E2E against the packaged app (sub-PRD a shell): `curl` with wrong Host header rejected; renderer flow succeeds with no user-visible auth (AC-18b.2.1); canary test asserts the token appears in zero artifacts.
- Security review: this sub-PRD is the security-worker-bee Ship Gate focus; the handshake design ships only with its sign-off.

## Risks and Open Questions

- **Risk:** the origin-pinned handshake is the linchpin; a flaw in origin handling undermines the token. **Mitigation:** single hardcoded allowlist entry, deny-by-default, adversarial review at the gate.
- **Risk:** body cap vs prd-013 audio uploads. **Mitigation:** cap named and sized now, revisited when prd-013 lands.
- **Open question:** should the CLI `waggle studio` path require the token by default (recommended: yes, generated and printed once) or only when `WAGGLE_STUDIO_TOKEN` is set? Decide in implementation; document in the command's help text without changing its surface (ADR-019).
- **Open question:** handshake rate — whether the extension re-handshakes per message or caches per launch. Recommended: cache with the single re-handshake of AC-18b.3.3.

## Related

- [PRD-018 index](./prd-018-desktop-application-index.md)
- [ADR-020 — security consequences of distribution](../../../knowledge/private/architecture/ADR-020-electron-desktop-shell-unsigned-builds.md)
- [ADR-008 — env refs contract this extends](../../../knowledge/private/architecture/ADR-008-credentials-env-refs-never-in-project-files.md)
