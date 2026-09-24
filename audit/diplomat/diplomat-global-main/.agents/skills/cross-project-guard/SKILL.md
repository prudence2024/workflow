---
name: cross-project-guard
description: Pre-flight check before destructive database/deployment operations. Verifies the current working directory, git remote, Supabase project ref, and Vercel project all belong to the intended target. Prevents cross-project contamination when multiple repositories share a machine.
version: 1.0.0
source: Diplomat Global cross-project contamination incident
---

# Cross-Project Target Guard

Run this guard BEFORE any dangerous operation that targets an external service:

- `supabase db push`
- `supabase migration up`
- `supabase db reset`
- `supabase link`
- `vercel --prod` or any deployment
- `git push origin main` (production push)
- Any destructive database migration

## Workflow

### 1. Identify Current Context

```bash
pwd
git branch --show-current
git remote get-url origin
cat supabase/.temp/project-ref 2>/dev/null || echo "NO SUPABASE LINK"
```

### 2. Verify Against Expected Target

| Check | Expected (Diplomat) | Expected (LittleReads) |
|---|---|---|
| git remote | prudence2024/diplomat-global | Sesughter01/little_reads |
| Supabase ref | urorrrmyzsuwulfljvwm | LOCALHOST ONLY |
| Vercel project | diplomat-global | NONE |
| branch | testing | main |

### 3. Decision Gate

If ANY of these are true → **ABORT**:

- [ ] Current directory is not the expected project root
- [ ] Git remote does not match the intended repository
- [ ] Supabase linked project ref does not match the intended database
- [ ] Vercel project does not match the intended deployment target
- [ ] Working on the wrong branch for the intended operation

### 4. Safe Operations (No Guard Needed)

- `git status`, `git log`, `git diff` (read-only)
- `npx tsc --noEmit` (typecheck only)
- Reading environment variables
- Inspecting remote configuration

## Anti-Patterns to Watch

1. **Running `supabase link` from the wrong project directory** — this was the root cause of the Diplomat/LittleReads contamination
2. **Using `VERCEL_URL` that points to the wrong deployment** — callbacks and webhooks will hit the wrong environment
3. **Pushing to the wrong branch** — always verify `git branch --show-current` before `git push`
4. **Running migrations from a different project's supabase/ directory** — check `supabase/.temp/project-ref` matches

## If Contamination Occurs

1. STOP immediately
2. Do NOT attempt automatic rollback
3. Document: which project, which service, what was changed
4. Report to owner with exact remediation steps
5. Verify no data was lost or corrupted

## Integration with Other Skills

Run this guard as a pre-check before:
- `payments-paystack-test`
- `deployment-verifier`
- `database-integrity`
- `full-system-audit`

## Multi-Project Machine Configuration

When multiple projects share a machine:

```bash
# Enable path-specific credentials
git config --global credential.https://github.com.useHttpPath true

# Each project gets its own credential scope
# Project A (diplomat-global) → prudence2024 account
# Project B (little_reads) → Sesughter01 account
```

Never use `git credential-manager github logout` for all accounts — only logout the specific wrong account.
