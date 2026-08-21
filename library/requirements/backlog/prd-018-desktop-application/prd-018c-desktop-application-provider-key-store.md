# PRD-018c: Provider-key store with safeStorage encryption

> **Waggle** — sub-feature PRD of [PRD-018](./prd-018-desktop-application-index.md)
>
> **Status:** Draft
> **Priority:** P1
> **Effort:** M

## Phase Overview

### Goals

Implement ADR-017 inside the desktop app: provider API keys (ElevenLabs, vision-QA, storage) are entered on the Studio recordings page, encrypted at rest via Electron's `safeStorage` into a single config file in the OS app-data directory, and decrypted in-process at call time only. The CLI and CI path continues resolving provider keys from env refs, unchanged (ADR-019 interaction).

### Scope

- Main-process key store service: encrypt via `safeStorage` (Keychain/DPAPI/libsecret-backed), persist ciphertext blobs to app-data under the `legioncodeinc.waggle` namespace, exactly one file, never inside a project directory.
- Studio settings surface on the recordings page: per-provider key entry, masked display, and removal.
- A `KeySource` injection seam on provider-consuming packages (`packages/narrate` today; future vision-QA per prd-011) so desktop supplies decrypted values in-process at call time without touching adapter logic.
- Headless-Linux fallback per ADR-017: machine-local key file outside every project directory when no OS secret store is available.

### Out of scope

- Demo target credentials — ADR-008's contract and PRD-010's machinery are untouched; this store never holds replay credentials.
- Key export/backup or sync (losing app-data means re-entering keys — accepted by ADR-017).
- Any CLI surface for provider keys (ADR-019).

### Dependencies

- **Blocks:** none directly; module AC8 (zero-terminal pass) requires it.
- **Blocked by:** sub-PRD a (shell, preload/IPC bridge), sub-PRD b (authenticated routes for the settings surface).
- **External:** Electron `safeStorage`; provider-consuming packages as they exist.

## User Stories

### US-18c.1 — Enter a provider key without a terminal

**As a** desktop user, **I want** to paste my ElevenLabs key into the recordings page, **so that** narration works without editing `.env` files.

**Acceptance criteria:**
- AC-18c.1.1 Given the settings surface, when a key is submitted, then the value is encrypted via `safeStorage` and persisted to the app-data file; the response confirms the provider name, never the value.
- AC-18c.1.2 Given the persisted file, when its bytes are scanned, then the plaintext key appears nowhere (canary assert), and the file lives outside every Waggle project directory.
- AC-18c.1.3 Given the UI, then a stored key displays masked (last four characters at most) with a remove control, never a reveal control.

### US-18c.2 — Keys decrypt only at call time

**As a** maintainer, **I want** provider values to exist in memory only inside the call that uses them, **so that** the ADR-017 in-process rule is structural, not conventional.

**Acceptance criteria:**
- AC-18c.2.1 Given a narration render in the packaged app, when the adapter calls the provider, then the key is decrypted inside the adapter's call path via the injected `KeySource` and is absent from logs, prompts, run reports, and error strings (canary battery extended to provider keys).
- AC-18c.2.2 Given the CLI/CI path, when the same adapter runs outside the desktop app, then it resolves keys from env refs exactly as before, with no code-path divergence beyond the injected source.
- AC-18c.2.3 Given the renderer, when any IPC round-trip occurs, then key values never cross the bridge — the bridge carries commands ("store", "remove", "list-masked"), never values.

### US-18c.3 — Remove a key

**As a** user, **I want** to revoke a stored key, **so that** I control what Waggle can spend.

**Acceptance criteria:**
- AC-18c.3.1 Given a stored key, when remove is confirmed, then the entry is deleted from the app-data file and the masked list updates.
- AC-18c.3.2 Given a removed key, when a render needing it is attempted, then the failure names the provider and says the key is missing, without echoing any prior value.

## Technical Considerations

- **Storage shape:** app-data file holds `{ providers: { <id>: { ciphertext: base64, createdAt } } }`; the file is rewritten whole on change; directory permissions default-private per OS convention. Path derived from Electron's `app.getPath('userData')` under the ADR-017 namespace.
- **safeStorage availability:** check `safeStorage.isEncryptionAvailable()`; when unavailable (minimal Linux), fall back per ADR-017 to the machine-local key file protecting the config — same location rules, never a project dir. Surface the fallback state in the settings UI so the user knows the posture.
- **KeySource seam:** a two-method interface (`available(providerId): boolean`, `resolve(providerId): string` implemented in main; env-ref implementation already implicit in adapters). Adapters keep their injectable-transport architecture (ledger standing decision); only the value's origin varies.
- **Canary discipline:** provider keys join PRD-010's forbidden-string battery: IR, project JSON, run reports, logs, prompts, screenshots, provider payloads (other than the owning provider's auth header), and the app-data file's scanned bytes.

## Files Touched

### New files
- `apps/desktop/src/main/provider-keys.ts` — store/load/remove with `safeStorage`
- `apps/desktop/src/main/key-source.ts` — `KeySource` implementation over IPC for provider packages
- `apps/studio` recordings settings route + component for key entry/masked list/removal
- Tests mirroring each (unit + canary)

### Modified files
- `packages/narrate` — accept an injected `KeySource` alongside env refs (no adapter logic change)
- PRD-010 canary battery — provider-key fixtures added
- Sub-PRD a's preload bridge — command-only IPC channel registration

## Test Plan

- Unit: encrypt/decrypt round-trip with mocked `safeStorage`; fallback path when encryption reports unavailable; masked-list redaction (AC-18c.1.3).
- Canary (real fs): plaintext absent from the app-data file and from every artifact of a render run (AC-18c.1.2, AC-18c.2.1) — real seam, not a mock, per the repo's testing rule.
- E2E: enter key in UI → narration run with mocked transport → adapter received the decrypted value; remove key → run fails naming the provider (AC-18c.3.2).
- Regression: existing `pnpm --filter` suites for narrate and CLI stay green with zero source changes to env-ref behavior (AC-18c.2.2).

## Risks and Open Questions

- **Risk:** reinstall or app-data wipe loses keys silently. **Mitigation:** accepted by ADR-017; the settings page states it plainly.
- **Risk:** Linux keyring absence in the packaged matrix. **Mitigation:** ADR-017 fallback implemented and surfaced (not hidden), and Linux is not a packaged target (index non-goal).
- **Open question:** masked display length — last four vs none at all. Recommend last four for user orientation; confirm in implementation review.

## Related

- [PRD-018 index](./prd-018-desktop-application-index.md)
- [ADR-017 — provider keys encrypted local config](../../../knowledge/private/architecture/ADR-017-provider-api-keys-encrypted-local-config.md)
- [ADR-008 — the other credential class, untouched](../../../knowledge/private/architecture/ADR-008-credentials-env-refs-never-in-project-files.md)
