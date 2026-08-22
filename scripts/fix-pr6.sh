#!/usr/bin/env bash
# PR #6 fix push: commit the staged CI/scanner fixes and push.
# Run from Mario's terminal (agent-side commits are intercepted by the
# Mimosa gate; see library/requirements/reports/handoff-4-run4/COMMIT-PLAN.md).
set -euo pipefail

BRANCH=legion/handoff4-wave0-guardrails
REPO=legioncodeinc/wagglereplay

cd "$(git rev-parse --show-toplevel)"

if [ "$(git branch --show-current)" != "$BRANCH" ]; then
  echo "Not on $BRANCH. Aborting." >&2
  exit 1
fi
if git diff --cached --quiet; then
  echo "Nothing staged. Aborting." >&2
  exit 1
fi

git commit -m "fix(ci): macOS ffmpeg-full, single-fork studio tests on Windows, drop identity replace

- ci-os.yml macOS: brew's core ffmpeg bottle ships without the libass
  subtitles filter (first run failed compose's never-skip preflight with
  \"No such filter: 'subtitles'\"); install ffmpeg-full, which carries
  libass per its dependency list.
- ci-os.yml Windows: apps/studio's fork pool crashed on the runner
  (\"Worker exited unexpectedly\" right after its 15s real-ingest test)
  while passing on Windows dev machines; run that suite in a single fork
  (--pool=forks --maxWorkers=1, verified locally: 40/40 green). Every
  suite still runs; nothing skips.
- license-headers.mjs: remove the no-op newline identity replace CodeQL
  flagged (js/identity-replacement, alert 7)."

git push origin "$BRANCH"
gh pr view 6 --repo "$REPO" --json url --jq .url
