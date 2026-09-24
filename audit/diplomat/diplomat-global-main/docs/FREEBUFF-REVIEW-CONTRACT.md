# Freebuff Review Contract — Diplomat Global

This document defines the mandatory review and verification process for every
substantial Freebuff implementation batch on this repository.

---

## Required Pipeline

For every meaningful change batch:

```text
1. IMPLEMENT
2. TYPECHECK          → npx tsc --noEmit (exit 0)
3. TEST               → npm test (all green)
4. BUILD              → npm run build (successful)
5. CODERABBIT REVIEW  → Where CodeRabbit is available on the PR
6. INVESTIGATE         → Read and evaluate every CodeRabbit finding
7. FIX VALID FINDINGS → Apply legitimate fixes, re-run gates
8. RE-TEST            → npm test after fixes
9. RE-REVIEW          → Push update for CodeRabbit re-review
10. PR                 → Open PR targeting the correct base branch
```

**No step may be skipped or claimed without evidence.**

---

## Internal Adversarial Preflight

Freebuff may perform an internal adversarial preflight against its own code
during or after implementation. This is permitted and encouraged.

However, it must be accurately classified:

```text
SOURCE=FREEBUFF_INTERNAL_ADVERSARIAL_PREFLIGHT
```

It does **not** count as:

- `INDEPENDENT_SECURITY_REVIEW`
- `INDEPENDENT_LOGIC_REVIEW`
- `CLEAN_ROOM_REVIEW`

Those require a separate reviewer/session that did **not** generate the code.

---

## Evidence Classification

All evidence must be honestly classified using:

| Level | Meaning |
|-------|---------|
| `OWNER_RUNTIME` | Owner tested on real deployment |
| `ATTACK_RUNTIME` | Adversarial test executed against live/staging |
| `AUTOMATED` | Tests, typecheck, build passed |
| `STATIC` | Code inspection only |

A stronger result at a higher level overrides lower-level claims.

---

## Pending Independent Reviews

Freebuff must leave the following gates as `PENDING` until another reviewer
completes them:

| Gate | Status | Assigned to |
|------|--------|-------------|
| `INDEPENDENT_SECURITY_REVIEW` | PENDING | Codex / human reviewer |
| `INDEPENDENT_LOGIC_REVIEW` | PENDING | Codex / human reviewer |
| `CLEAN_ROOM_PAYMENT_REVIEW` | PENDING | Codex / human reviewer |
| `CLEAN_ROOM_INVENTORY_REVIEW` | PENDING | Codex / human reviewer |
| `CLEAN_ROOM_COUPON_REVIEW` | PENDING | Codex / human reviewer |

Freebuff must **not** claim these as PASS. It may note that internal preflight
found no issues, but that is a different claim.

---

## Git Discipline

| Rule | Detail |
|------|--------|
| Working branch | `testing` for implementation |
| Tooling branches | `chore/*` prefix, targeting `testing` |
| Main branch | Never pushed by Freebuff directly |
| Production deploy | Owner only, never Freebuff |
| Force push | Never |
| Migrations | Require explicit Owner approval after remote preflight |
| Payments | Never initiate without forged-webhook gate passing first |

---

## CodeRabbit Integration

When CodeRabbit is available on a PR:

1. Open the PR targeting the correct base branch.
2. Wait for CodeRabbit's automatic review.
3. Read every Critical and Major finding.
4. For each finding:
   - If valid: fix, re-run gates, push update.
   - If invalid: document the reason with technical evidence.
5. Do not merge with unresolved Critical findings.

If CodeRabbit is rate-limited or unavailable:

```text
CODERABBIT_REVIEW=PENDING
```

Do **not** fabricate a PASS.

---

## What Freebuff Must Never Do

- Claim "all checks pass" without running them.
- Mark independent review gates as PASS when only internal preflight was done.
- Apply database migrations without Owner approval.
- Deploy to Production.
- Initiate payments.
- Force push.
- Discard Owner-reported defects.
- Close Owner issues with "code looks correct" without runtime evidence.

---

*This contract applies to all future Freebuff sessions operating on Diplomat Global.*
