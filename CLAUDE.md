# CLAUDE.md: wagglereplay

Waggle: open source, local-first toolchain that records a web app walkthrough once (Chrome extension: pixels + click/route/element telemetry), stores it as a git-committable Walkthrough IR, and regenerates narrated demo videos from it at any aspect ratio via Playwright replay + ffmpeg composition. AGPL-3.0. Personal-first project by Mario Aldayuz (Legion Code Inc). PRDs 001 through 010 are built and merged (capture-to-render pipeline plus the replay-regeneration and credential-masking moat); PRD-018 (Electron desktop app) is planned and unbuilt.

## Read first, always

1. `library/knowledge/private/architecture/` holds 20 accepted ADRs. They are locked decisions; do not relitigate them in PRs or PRDs. Supersede via a new ADR only.
2. `library/requirements/` holds the 19-PRD build plan (phases 1 to 4); shipped PRDs live in `completed/`, the rest in `backlog/`. PRD section 0 dependencies dictate build order; never build a PRD whose dependencies are unmet.
3. `library/knowledge/private/waggle/` is the research corpus (receipts included). Source PRD content from corpus + ADRs only.
4. `library/notes/` is human-only. Never read, write, or cite it.

## Non-negotiables

- Ship Gate before ANY commit, in this exact order: security-stinger, then quality-stinger, then github-repo-health-stinger. Reports land in `library/`. Medium+ findings get fixed, then full re-check. Mario approves every commit; never `git commit` or `git push` without his explicit go-ahead.
- Never use em dashes or en dashes in any authored file, doc, or message. Ordinary punctuation only.
- No secrets in walkthrough project files, IR, logs, or prompts (ADR-008): env refs only.
- No AGPL/Cap source code copied in (clean-room reimplementation of concepts only).
- No destructive git operations, no force-push.

## Stack (locked by ADRs)

pnpm workspace monorepo: `apps/extension` (Chrome MV3), `apps/studio` (local SvelteKit 5 editor), `packages/ir`, `packages/replay` (Playwright), `packages/compose` (ffmpeg default; Remotion as optional plugin in `plugins/remotion`), `packages/narrate` (ElevenLabs default adapter), `packages/cli`. Node 24, TypeScript, Vitest + Playwright tests. Filesystem project dirs are the datastore; there is no database (ADR-015). Local-first; Cloudflare Containers only as an optional runner profile (ADR-014).

## Task sizing

Decompose to agent tasks of 10 minutes or less, mapped to PRD acceptance criteria. Each PRD index carries the wave-ordered AC groups and task table; the-smoker consumes those.
