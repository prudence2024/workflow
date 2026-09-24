# Diplomat Global — Branch & Deployment Policy

## Permanent Rules (enforced for all AI agents and human contributors)

### Branches

| Branch | Purpose | Vercel Environment |
|---|---|---|
| `main` | Production-ready code only | Production |
| `testing` | Active development + staging | Preview only |

### NEVER Do

- `git push origin main` — without explicit owner approval in the current conversation
- `git push --force` or `git push --force-with-lease main`
- `npx vercel --prod` or `vercel deploy --prod` from any branch
- Merge testing → main without owner approval
- Promote a Vercel Preview to Production
- Change Vercel Production Branch setting
- Run `deploy --prod` scripts

### Normal Workflow

```
edit files
→ local tsc + build pass
→ git commit
→ git push origin testing
→ Vercel creates Preview automatically
→ runtime QA on Preview
→ report to owner
→ owner approves
→ owner merges testing → main (or approves PR)
→ Vercel deploys to Production from main
```

### Deployment Commands

**CORRECT** (from testing branch):
```bash
git push origin testing
# Vercel Preview is created automatically
```

**NEVER** (from testing branch):
```bash
npx vercel --prod    # ← THIS PROMOTES TO PRODUCTION
```

### Production Promotion

Production promotion is OWNER-CONTROLLED only:
1. Owner reviews PR #4 (testing → main)
2. Owner merges the PR
3. Vercel auto-deploys from main to Production

### If Build Fails on Vercel

1. Fix locally
2. Verify: `npx tsc --noEmit && npm run build`
3. Commit + push to testing
4. Wait for Preview build
5. Do NOT use `--prod` to "fix" a failed build

### Historical Note

Previous sessions incorrectly used `npx vercel --prod` from the testing branch,
which promoted testing commits to Production. This caused:
- Failed builds appearing as Production errors
- Testing code running on production before QA
- Confusion about which code is live

This policy prevents recurrence.
