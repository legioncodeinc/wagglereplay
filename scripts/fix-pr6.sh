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

git commit -m "fix(ci): pin macOS to evermeet ffmpeg 9.0.1, Windows job to Node 25

Round 2 diagnosis after the ffmpeg-full run still failed:

- The compositor requires ffmpeg 9; ffmpeg 8.1 rejects its
  dynamic-dimension scale chains with EINVAL (isolated locally against
  BtbN 8.1 win64: the t-dependent ripple scale with eval=frame on a
  looped image input reproduces it deterministically, 12/12, while the
  identical graph on 9 passes). Homebrew tops out at 8.1 (both ffmpeg
  and ffmpeg-full), so the macOS job now pins evermeet.cx's 9.0.1
  builds (libass included) with SHA-256 verification, resolved through
  WAGGLE_FFMPEG_PATH/WAGGLE_FFPROBE_PATH.
- Windows job moves to Node 25 (the primary dev machine's line): Node
  24.19 crashed apps/studio's vitest fork mid-suite on the runner even
  in a single fork (the known Windows forks-teardown crash class);
  ubuntu CI already covers the .nvmrc Node line. The single-fork studio
  invocation stays."

git push origin "$BRANCH"
gh pr view 6 --repo "$REPO" --json url --jq .url
