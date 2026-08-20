# Move this folder's contents into .github/

The Cowork device bridge protects `.github/` paths (workflow files are security-sensitive), so these seven files were staged here instead. From the repo root, review them, then:

```powershell
Move-Item _github-seed/CODEOWNERS,.\_github-seed/dependabot.yml,.\_github-seed/PULL_REQUEST_TEMPLATE.md .github/ -Force
Move-Item _github-seed/ISSUE_TEMPLATE .github/ -Force
Move-Item _github-seed/workflows .github/ -Force
Remove-Item _github-seed -Recurse
```

Or with bash: `mkdir -p .github && cp -r _github-seed/* .github/ && rm -rf _github-seed` (this file excluded by review).

Contents: CODEOWNERS, dependabot.yml, PULL_REQUEST_TEMPLATE.md, ISSUE_TEMPLATE/bug_report.md, ISSUE_TEMPLATE/feature_request.md, workflows/ci.yml (bootstrap-safe, SHA-pinned), workflows/codeql.yml. Details in library/requirements/reports/2026-08-20-repo-seed-report.md.
