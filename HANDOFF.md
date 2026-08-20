# HANDOFF: wagglereplay (Waggle)

Audience: the next agent (any harness) picking this repository up. Written 2026-08-20 at the end of the seeding session. Read this file top to bottom before touching anything. Where this file and an ADR disagree, the ADR wins. Where anything disagrees with Mario, Mario wins.

## 1. What this project is

Waggle is an open source (AGPL-3.0), local-first toolchain that records a walkthrough of a web app once in Chrome (pixels plus click/mouse/route/element telemetry), stores it as a git-committable Walkthrough IR, and regenerates polished narrated demo videos from it forever: any aspect ratio, any branding, re-rendered on demand as the target app changes. Owner: Mario Aldayuz (Legion Code Inc, github.com/legioncodeinc). It is personal-first: he is building it for his own use and publishing it openly. There is NO monetization, NO SaaS, NO tenancy, NO billing anywhere in scope (ADR-012, ADR-013). The name comes from the waggle dance: a bee showing the hive the exact route.

The one-sentence architecture: Chrome MV3 extension captures video plus an epoch-aligned event stream; ingest turns that into an immutable IR inside a filesystem project directory; a local studio app is where the author describes each step; a narration engine drafts a script and synthesizes voice with word timestamps; a Playwright replay engine re-executes the IR at any viewport; an ffmpeg compositor overlays synthetic cursor, ripples, karaoke captions, watermark, and audio into final MP4s; vision QA and odiff baselines guard regeneration.

## 2. Current state (exact)

- The repo contains ONE commit (GitHub's init: README stub + Node .gitignore, both since replaced in the working tree) plus 92 seeded, UNCOMMITTED files in the working tree. Nothing has been committed or pushed since seeding. Do not commit without passing the ship gate and getting Mario's explicit approval (section 5).
- No application code exists yet. The seed is planning material plus repo baseline: community health files, CI, Library Schema v2, 15 ADRs, a research corpus, and 17 PRDs.
- `_github-seed/` at the root holds the seven `.github/` files (workflows/ci.yml, workflows/codeql.yml, CODEOWNERS, dependabot.yml, PULL_REQUEST_TEMPLATE.md, ISSUE_TEMPLATE/bug_report.md, ISSUE_TEMPLATE/feature_request.md) because the Cowork device bridge refuses writes under `.github/` (protected paths). A human, or any agent running with direct local file access, must move them into `.github/` and delete `_github-seed/` (instructions inside `_github-seed/MOVE-TO-DOT-GITHUB.md`). Until moved, CI and templates are inert.
- CI (`ci.yml`) is bootstrap-safe by design: install/lint/typecheck/test steps guard on package.json and pnpm-lock.yaml existing and use `--if-present`, so the seeded repo goes green and the pipeline activates automatically when prd-001 lands the workspace. Actions are pinned to full commit SHAs (checkout v7.0.1, setup-node v7.0.0, codeql-action v4.37.7, resolved 2026-08-20).
- LICENSE is the verbatim SPDX AGPL-3.0-or-later text. Do not edit it.
- The original SaaS-framed master spec plus its open-source-pivot addendum lives at `library/knowledge/private/waggle/waggle-master-spec.md`. It is context, not law: five ADRs revised it the same day it was written.

## 3. Decisions already made (locked; supersede only via a new ADR)

All in `library/knowledge/private/architecture/`, all Accepted 2026-08-20, from a 20-decision interrogation of the owner:

- ADR-001 IR schema: strict superset of the Puppeteer Replay / Chrome Recorder user-flow schema.
- ADR-002 Replay capture: CDP Page.startScreencast JPEG frames piped to ffmpeg H.264; virtual-time capture is a later upgrade.
- ADR-003 Compositor: ffmpeg is the DEFAULT backend; Remotion is an optional plugin (license cliff at 4+ person users).
- ADR-004 Render compute: local machine by default; Cloudflare Containers exists only as an optional runner profile.
- ADR-005 Visual baselines: in-house on odiff, stored in the project dir; no vendor.
- ADR-006 Voice: ElevenLabs Flash default, eleven_v3 premium toggle, Deepgram Aura-2 budget adapter (needs alignment pass), xAI watch list.
- ADR-007 Avatars: deferred to phase 4; the compositor reserves a PiP layer slot now.
- ADR-008 Credentials: env REFS only, resolved inside the replay package at fill time; secrets never in project files, IR, logs, screenshots, or prompts.
- ADR-009 Delivery: local render files plus a static share-page export; user-owned R2 upload optional.
- ADR-010 Extension permissions: include webRequest for network-quiescence settle markers; sideload during pre-alpha.
- ADR-011 Non-responsive apps: IR-focus smart reframe (animated crop following click coordinates), outputs labeled native vs reframed.
- ADR-012 Monetization: none; the shelved seats-plus-minutes plan is archived in the corpus economics doc.
- ADR-013 Direction: open source personal-first, AGPL-3.0, copyright retained by Legion Code Inc.
- ADR-014 Runtime: local-first; cloud only as optional CI-regeneration runner.
- ADR-015 Storage: a Waggle project is a filesystem directory (demo-as-code); there is no database.

## 4. Repo map and reading order

1. `CLAUDE.md` (root): standing rules for agents. Read every session.
2. `library/knowledge/private/architecture/`: the 15 ADRs above.
3. `library/knowledge/private/waggle/`: research corpus with primary-source receipts: capture-layer, walkthrough-ir-and-project-format, replay-and-render, voice-and-narration, composition, market-landscape, economics-archive, plus the master spec. PRD content must be sourced from corpus plus ADRs only.
4. `library/requirements/backlog/`: 17 PRD folders, each with an index (section 0 dependencies, phase, wave-ordered acceptance criteria, sub-10-minute task table with suggested Bee) and an empty `qa/` folder for reviewer evidence.
5. `library/requirements/reports/2026-08-20-repo-seed-report.md`: what was created, what differs, and every item needing a human (GitHub Settings toggles, the _github-seed move).
6. `library/knowledge/private/standards/documentation-framework.md`: Library Schema v2 rules (PRD/IRD lifecycle = folder moves; numbering; naming).
7. `library/notes/`: HUMAN-ONLY. Never read, write, summarize, or cite it.

## 5. Operating rules (non-negotiable)

- Ship gate before ANY commit, in this exact order: security-stinger, then quality-stinger, then github-repo-health-stinger. Each writes a real report into the library (per-PRD evidence into that PRD's `qa/`; repo-wide reports into `library/requirements/reports/`). Medium or worse findings get fixed, then the WHOLE gate re-runs. Mario reviews the reports and approves; agents never `git commit` or `git push` without his explicit go-ahead. No force-push, no destructive git, ever.
- Never use em dashes or en dashes in anything authored for this repo (code comments, docs, commit messages, PR text). Ordinary punctuation only. Verify before finishing: a scan for the two characters must return zero.
- No secrets anywhere in committed files or agent prompts. Credentials follow ADR-008. `.env` is gitignored; `.env.example` documents variables.
- Never copy source code from CapSoftware/Cap or any AGPL-incompatible-for-us codebase; concepts are reimplemented clean-room. (Waggle itself is AGPL, but Cap's code stays out regardless: the boundary is deliberate.)
- PRD discipline: build order follows section 0 dependencies; a PRD whose dependencies are unmet does not start. Within a PRD, waves are sequential and tasks inside a wave are parallel-safe. Decompose any new work to tasks of 10 minutes or less. Acceptance criteria are pass/fail from evidence; do not mark anything complete without it. Lifecycle is folder location: move the entire PRD folder backlog to in-work to completed.
- When something is ambiguous or contradicts an ADR, stop and ask Mario. Do not guess confidently.

## 6. Immediate queue

Human (Mario) items, blocking full activation:
1. Move `_github-seed/` contents into `.github/` and delete the folder.
2. GitHub Settings: enable Secret Protection + Push Protection; create a ruleset on main (require PR, require CI checks, require Code Owner review, block force pushes); enable private vulnerability reporting; choose CodeQL default setup OR keep the committed workflow (not both).
3. Review the seed, then approve the first commit after the ship gate passes.

Agent items, in order:
1. Run the ship gate over the seeded tree (security, quality, repo health), file the three reports, fix anything medium or worse, re-run, then present to Mario for commit approval. Suggested first commit message: `chore: seed library schema, ADRs, PRD backlog, and repo baseline`.
2. After the seed commit: begin phase 1 execution. prd-001 (CLI and project format) and prd-002 (Walkthrough IR) are the entry points; 001 wave 1 has no blockers. The owner drives whole features with the-smoker pointed at PRD folders; single tasks route through the-beekeeper. If those orchestrators are unavailable in your harness, execute the PRD task tables directly, one wave at a time, and keep the same evidence discipline.
3. Expectation setting: the owner builds demo-grade at this scale in roughly 24 hours with a parallel fleet. Phase 1 (prd-001 through prd-008) is the record-then-narrate wedge and is sized for exactly that kind of parallel dispatch: lanes 001+002 first, then 003/004/005/006 largely in parallel, then 007/008.

## 7. Build plan summary

| Phase | PRDs | Outcome |
|---|---|---|
| 1 | 001 cli/format, 002 ir, 003 extension, 004 ingest, 005 studio, 006 narration, 007 ffmpeg compositor, 008 outputs/share | Record a walkthrough, describe it, narrate it, render a branded 16:9 MP4, export a share bundle |
| 2 | 009 replay engine, 010 credentials/masking, 011 vision QA + baselines, 012 CI regeneration | The moat: deterministic re-render at any aspect ratio, safe auth replay, regression-guarded `waggle regen`, videos that update on release |
| 3 | 013 audio-upload alignment, 014 Remotion plugin | User-voiced videos; optional fancy compositor |
| 4 | 015 explorer agent, 016 audio-only generation, 017 avatar PiP plugin | Agent-drafted walkthroughs and UX findings, video from narration alone, talking-head overlay |

Stack (locked): pnpm workspace monorepo (apps/extension, apps/studio on SvelteKit 5, packages/ir, packages/replay, packages/compose, packages/narrate, packages/cli, plugins/remotion), Node 24, TypeScript, Vitest plus Playwright for tests, ffmpeg 7+ expected on PATH.

## 8. Session context that is not written anywhere else

- The project began this same day as a multi-tenant SaaS spec ("does this make sense, spec it out"). Mid-planning, Mario pivoted: "the big reason I want it is for myself," open source, would that simplify. Answer: yes, roughly 40 percent of the build surface disappeared. Five ADRs record where the pivot revised same-day answers; the spec addendum summarizes the deltas. Treat the SaaS material (market landscape, shelved pricing) as dormant option value, not scope.
- The owner explicitly delegated stack choice to research once, then locked everything via the ADR interrogation. Do not reopen locked decisions to "improve" them; his system treats relitigating ADRs as a failure mode.
- Known tooling quirks from this session: the Cowork device bridge cannot write `.github/` paths (hence _github-seed) and its Linux workspace (device_bash) was unavailable, so files moved via stage/commit. If you are running locally in his harness, neither limitation applies to you.
- A published artifact of the master spec exists on Mario's claude.ai account (private to him); the in-repo copy is identical and is the one agents should read.
- Voice cost math, market receipts, and per-render economics are in the corpus with sources and a volatility warning: recompute model prices quarterly rather than trusting the tables blind.

End of handoff. First action for a fresh agent: read CLAUDE.md, then the ADR folder, then run the ship gate on the uncommitted seed.
