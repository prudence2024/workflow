# Diplomat Global — Independent AI Review Policy

## Purpose

No AI coding agent may be considered the sole authority on code that it generated.

Code produced by Freebuff, Codex, another AI system, or a human must be independently
challenged before release. The goal is deliberate adversarial search for weaknesses,
not agreement between AI systems.

---

## 1. Adversarial Security Review

Security review must be framed as an **attack**, not merely "review this code."

### Attack surfaces

Every server function, API route, or user-input boundary must be attacked for:

- authentication bypass
- authorization bypass / privilege escalation
- IDOR (insecure direct object reference)
- service-role abuse
- injection (SQL, template, header, log)
- stored / reflected XSS
- CSRF / origin abuse
- webhook forgery and replay
- race conditions (double-spend, double-use, TOCTOU)
- payment duplication or manipulation
- inventory corruption
- coupon abuse (duplication, normalization bypass, expiry bypass)
- malicious uploads (SVG/script, MIME mismatch, oversized)
- rate-limit bypass
- PII exposure / secret leakage
- audit-log bypass

### Findings format

Every finding must include:

| Field | Description |
|-------|-------------|
| FINDING_ID | Unique identifier |
| SEVERITY | CRITICAL / HIGH / MEDIUM / LOW / INFORMATIONAL |
| ATTACK_SURFACE | Which surface was attacked |
| PRECONDITION | What must be true for the attack to work |
| EXPLOIT_SCENARIO | Step-by-step exploitation path |
| EXPECTED_IMPACT | What the attacker gains |
| EVIDENCE | Code, log, or repro steps |
| RECOMMENDED_FIX | Concrete remediation |
| RETEST | How to verify the fix |

Do not report purely theoretical vulnerabilities without showing the reachable path.

---

## 2. Independent Logic Verification

Important business logic must be reviewed by a session that **did not generate**
the implementation.

Priority modules:

1. Payment finalization (Paystack callback + webhook)
2. Inventory / order availability state
3. Coupon lifecycle (create, apply, duplicate, expiry)

Walk every path through:

| Dimension | Description |
|-----------|-------------|
| INPUT | What enters the function |
| INITIAL_STATE | DB and app state before execution |
| BRANCHES | Every conditional path |
| DB_MUTATIONS | Every write, insert, update, delete |
| EXTERNAL_ACTIONS | Every provider call, email, notification |
| FINAL_STATE | Expected DB and app state after |
| EXPECTED_STATE | What the Owner would observe |
| CONSISTENT | Whether final matches expected |

Identify:

- undefined branches
- impossible or contradictory states
- conflicting sources of truth
- partial commits without rollback
- stale-state assumptions
- swallowed errors that allow continuation
- error branches that proceed as if they succeeded

---

## 3. Clean-Room Architecture Comparison

For critical modules, a separate reviewer may independently reconstruct the design
using **only**:

- requirements and acceptance criteria
- database schema / data contracts
- external provider contracts (Paystack, Cloudinary, Clerk, Resend, Telegram)
- security requirements
- expected observable behavior

Do **not** show the original implementation to this reviewer until its design is complete.

### Compare

| Dimension | Description |
|-----------|-------------|
| Data model | Tables, columns, relationships |
| State machine | Order/payment/inventory states |
| Auth | Who can do what |
| RBAC | Permission model |
| Validation | Input boundaries |
| Idempotency | Duplicate request handling |
| Transaction boundaries | What is atomic |
| Concurrency | Race-safe operations |
| Error handling | Failure paths and recovery |
| API design | Server function contracts |
| Logging / Observability | What is recorded |
| Tests | What is covered |

### Classify differences

| Classification | Meaning |
|---------------|---------|
| EXISTING_STRONGER | Original handles edge case better |
| CLEAN_ROOM_STRONGER | Independent design is safer/cleaner |
| EQUIVALENT | Both are equivalent |
| TRADEOFF | Difference is a deliberate tradeoff |
| REQUIREMENT_AMBIGUITY | Requirements were unclear |

---

## 4. Reviewer Independence

- Do **not** expose previous PASS conclusions before analysis.
- Reviewers must attempt to **disprove** prior PASS results.
- The implementation agent must never certify its own code as independently reviewed.
- CodeRabbit, Codex, and human reviewers each count as independent when they are
  separate sessions / agents.

---

## 5. CodeRabbit Role

CodeRabbit serves as the continuous implementation / diff reviewer.

It should aggressively inspect:

- correctness and regressions
- security vulnerabilities
- missing tests
- unsafe assumptions
- data consistency
- race conditions
- failure paths
- responsive / accessibility behavior

CodeRabbit does **not** replace:

- Independent red-team security review (Codex or human)
- Independent logic verification
- Clean-room architecture review
- Runtime QA
- Owner acceptance
- Full-system audit

### Finding resolution

- Critical and Major findings must be investigated before merge.
- A CodeRabbit suggestion may be rejected only with technical evidence.
- Do not dismiss security findings without documenting why they are acceptable.

---

## 6. Evidence Hierarchy

For Owner acceptance, evidence strength is ordered:

```text
OWNER_RUNTIME
  > ATTACK_RUNTIME
    > AUTOMATED (tests, typecheck, build)
      > STATIC (code inspection)
```

A stronger contrary result **reopens** a previous PASS.

Examples:

- Owner reports a visual bug → overrides a static "looks correct" finding.
- A forged webhook test fails → overrides a "signature check is correct" code review.
- A test fails → overrides a "code looks right" observation.

---

## 7. Release Principles

- Passing static inspection does **not** equal runtime proof.
- Every claim must cite its evidence level.
- Do not mark PASS based solely on code inspection when runtime evidence is required.
- Owner runtime acceptance is the final gate before production release.

---

## 8. Application to Diplomat Global

### Module-specific review priorities

| Module | Review type | Priority |
|--------|------------|----------|
| Payment finalization | Adversarial + Logic + Clean-room | CRITICAL |
| Inventory / order state | Adversarial + Logic | CRITICAL |
| Coupons | Adversarial + Logic | HIGH |
| Checkout | Adversarial + Logic | HIGH |
| Uploads (Cloudinary) | Adversarial | HIGH |
| Admin RBAC | Adversarial | HIGH |
| Backup / restore | Adversarial | HIGH |
| Webhook (Paystack) | Adversarial + Logic | CRITICAL |
| Telegram bot | Adversarial | MEDIUM |
| Newsletter | Logic | MEDIUM |
| Forms / input validation | Adversarial | MEDIUM |
| UI / responsive | Runtime QA | MEDIUM |

### Required review gates before production

| Gate | Owner | Status |
|------|-------|--------|
| Implementation + TSC + Tests + Build | Freebuff / Codex | Per batch |
| CodeRabbit diff review | CodeRabbit | Per PR |
| Independent security review | Codex / human | Before main merge |
| Independent logic verification | Codex / human | Before production |
| Clean-room architecture review | Codex / human | Before production |
| Runtime QA | Owner | Before production |
| Full system audit | Codex / human | Final gate |

---

*This policy is maintained in the repository root at `docs/AI-REVIEW-POLICY.md`.*
*It applies to all AI agents operating on the Diplomat Global codebase.*
