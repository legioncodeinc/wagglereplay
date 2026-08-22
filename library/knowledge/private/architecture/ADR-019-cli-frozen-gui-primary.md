# ADR-019: The CLI is frozen; the GUI is the primary path

Status: Accepted (2026-08-21)

## Context

prd-001 defines packages/cli's command surface (init, record, narrate, render, regen, export) and assumed the CLI was the primary way a user operated Waggle, with record originally documented as the command that launches Studio. ADR-016 through ADR-018 replace that assumption for interactive use: a human now launches Studio from the extension, records from the extension, and configures provider keys in a browser page, none of it through a terminal. One genuine terminal-shaped need remains: prd-012's CI regeneration. A GitHub Actions workflow has no browser and no extension to click, and needs a strictly non-interactive `waggle regen --check` entry point (prd-012 AC1 to AC3, prd-001 AC4's headless stub contract).

## Decision

packages/cli stays at the command surface prd-001 and prd-012 already define. No new user-facing commands or flags are added beyond finishing what those PRDs already scope; it stays fully tested, including prd-001 AC6's end-to-end round-trip and prd-012's CI regeneration checks. Every new user-facing capability this handoff introduces, launching Studio, the record button and countdown, the provider-key page, the recordings list, ships exclusively through the extension and desktop Studio app, never as new CLI surface area. The CLI's remaining purpose narrows to two roles: scripted or automation use by users who prefer it, and the mandatory non-interactive entry point prd-012's CI workflow requires, since a CI runner has no desktop app to launch and no browser to click through.

## Consequences

One UX surface to maintain instead of two competing ones; prd-012's CI path, the one place a terminal genuinely cannot be avoided, stays fully supported and unaffected by the GUI pivot. The `record` command keeps working exactly as prd-001 defined it, but its practical role for a human end user shrinks to redundant with the extension flow, useful mainly for prd-003 AC8's fixture-app end-to-end test and other scripted use; its help text and docs need to say so plainly, or a user reading `waggle record --help` will not know the extension flow is now the recommended path. Freezing the surface means any future feature request for the CLI needs to be redirected to the GUI in review, which takes ongoing discipline.

## Alternatives Considered

Grow the CLI into a full parity surface alongside the GUI. Rejected: it doubles the maintenance burden ADR-014 already argues against for a personal, single-maintainer tool, and nothing in the zero-terminal mandate wants a human using it. Remove the CLI entirely. Rejected: it would delete prd-012's only non-interactive entry point, and there is no replacement for CI regeneration without one.

## Supersession and interaction

Does not supersede any existing ADR; no ADR previously declared the CLI the primary interface, so there is nothing to formally revise. Reinforces ADR-014's cost-avoidance stance (no unnecessary maintained surface) and depends on ADR-004's runner-profile abstraction and prd-012 for the CI path this freeze preserves. Interacts with ADR-016 (the desktop app, not the CLI, now owns the primary launch path) and ADR-017 (the CLI and CI path keeps resolving provider keys from env refs rather than the encrypted desktop config).

Interaction note (2026-08-21): the `--check` entry point this ADR carves out for CI is defined and implemented by prd-011 (verdict set, exit codes, the flag itself, per prd-011 AC3); prd-012 consumes the finished contract inside its workflow and defines none of it. Ownership was ruled per HANDOFF-3's logic and recorded here so the two PRDs cannot both defer the flag to each other. This note records an allocation between two backlog PRDs; it does not change the decision above.

