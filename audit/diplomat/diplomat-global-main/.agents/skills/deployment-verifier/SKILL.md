---
name: deployment-verifier
description: Verify committed code builds cleanly from a clean worktree. Prevent local-uncommitted-passes-while-deployment-fails situations.
version: 1.0.0
---

# Deployment Verifier

## Rule
Working tree build ≠ committed code build.

## Process

After logical commits:

```bash
git status --short
git diff

# Clean worktree verification
git worktree add /tmp/diplomat-verify HEAD
cd /tmp/diplomat-verify
npm ci
npm run build

# Remove temporary worktree
cd /path/to/main
git worktree remove /tmp/diplomat-verify
```

## Report Separately
- WORKING TREE BUILD: pass/fail
- CLEAN COMMITTED BUILD: pass/fail

## Why This Matters
Previously, Telegram functions existed locally but were not committed, causing Vercel deployment failure while local build passed.

## Checks
- npx tsc --noEmit (report actual exit code)
- npm run build (report actual exit code)
- npm run lint (report actual exit code, note pre-existing debt)
- No secrets in committed code
- No uncommitted runtime-required files
