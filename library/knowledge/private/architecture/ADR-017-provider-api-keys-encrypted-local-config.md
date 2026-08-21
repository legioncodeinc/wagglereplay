# ADR-017: Provider API keys live in an encrypted local config outside the project

Status: Accepted (2026-08-21). Does not revise ADR-008; see Supersession and interaction.

## Context

ADR-008 already governs one class of secret: demo target credentials, the login and TOTP values a replay fills into the app being recorded, resolved from env refs inside packages/replay and never written into IR, assets, logs, or prompts. The zero-terminal flow introduces a second, different class: provider API keys (ElevenLabs, OpenAI, Gemini, Deepgram, R2) that Waggle itself uses to call narration, vision-QA, and storage providers. These are not replayed into anyone's app; they authenticate Waggle's own outbound calls, and the new Studio launch page asks the user to enter them in a browser field rather than edit .env by hand. Nothing in ADR-008 covers where those values should live once the terminal is gone.

## Decision

Provider API keys entered on the Studio recordings page are encrypted at rest and written to a single config file inside the desktop app's OS-standard app-data directory (for example, the platform's application-support path under a legioncodeinc.waggle namespace), scoped to the desktop install, never inside any Waggle project directory. Encryption uses the OS-provided secret store where one exists (Keychain on macOS, DPAPI on Windows, the Secret Service or libsecret on Linux) to protect the local encryption key, with a machine-local key file as the headless-Linux fallback, also kept outside any project directory. Provider-key-consuming packages (packages/narrate and any future vision-QA or R2-upload code) decrypt values in-process at call time only; the values never reach IR, meta.json, narration prompts, or logs. This is a distinct credential class from ADR-008: ADR-008 covers demo target credentials, resolved from env refs inside packages/replay; ADR-017 covers Waggle's own provider keys, held encrypted in app-data outside every project. ADR-008 is unchanged and remains fully in force for its subject.

## Consequences

Provider-key setup needs zero terminal use and zero file editing; keys sit in exactly one place a user can find and revoke them. It adds cross-platform crypto work, three different OS secret stores plus a fallback, that a plain .env never required, and it means the desktop app, not the CLI, becomes the primary place these keys are entered; the CLI and CI path (ADR-019, prd-012) keep resolving provider keys from env refs the way ADR-008's pattern already established, since a CI runner has no desktop app or OS keychain to read from. Losing or reinstalling without preserving app-data means re-entering every key.

## Alternatives Considered

Plaintext .env for provider keys, the same as demo credentials. Rejected: it fails the zero-terminal mandate outright, and provider keys carry direct billing risk in a way ADR-008's often-disposable demo credentials do not. OS keychain only, with no file fallback. Rejected as the sole mechanism: headless or minimal Linux installs do not reliably expose a Secret Service, and the desktop app must still work there. A hosted key vault. Rejected: it reintroduces a cloud dependency ADR-014 exists specifically to avoid.

## Supersession and interaction

Does not supersede ADR-008. ADR-008 remains fully in force, unchanged, for demo target credentials; ADR-017 adds a sibling decision for a different credential class ADR-008 never addressed. Extends ADR-014 (no cloud key vault) and ADR-015 (the encrypted config sits in app-data, explicitly outside every project directory, so project-directory git-committability is unaffected). Interacts with ADR-019: the CI and headless path continues to resolve provider keys from env refs rather than the encrypted desktop store.
