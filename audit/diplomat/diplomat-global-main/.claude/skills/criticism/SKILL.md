---
name: criticism
description: Second-order consequence analysis for code changes. For every feature/change, asks "WHAT HAPPENS TO THE REST OF THE APPLICATION WHEN THIS CHANGES?" — delete/update consequences, empty/stale state, duplicate events, concurrency, partial failure, provider failure, offline/reconnect, cache invalidation, historical integrity, derived data. Use before declaring a feature complete or code-complete.
argument-hint: "[feature, diff range, or file]"
license: MIT
metadata:
  author: prudence
  version: "1.0.0"
---

# Criticism

Second-order consequence analysis. NOT a style critic.

Central question: **"What happens to the rest of the application when this feature changes?"**

## When to Use

- Before declaring a feature complete or code-complete
- Before merging destructive actions (delete/purge/archive)
- After changing payment, inventory, notifications, email, cache or provider integration
- On any change where derived data (analytics, counts, badges, rankings) exists

## Required Analysis Model

For every important feature/change inspect ALL applicable lenses:

| Lens | Question |
|---|---|
| A. DELETE CONSEQUENCES | What references the record? (carts, orders, receipts, reviews, images, rankings, search, related products, category counts) |
| B. UPDATE CONSEQUENCES | What derived/cached state becomes stale? |
| C. EMPTY STATE | What happens with zero records? |
| D. STALE STATE | What happens when browser data is older than server data? |
| E. DUPLICATE EVENT | What happens if the action/webhook/callback runs twice? |
| F. CONCURRENCY | What happens if two users act simultaneously (e.g., final unit, last coupon use)? |
| G. PARTIAL FAILURE | What happens if step 2 of 4 fails? |
| H. PROVIDER FAILURE | What happens if Paystack/Telegram/Resend/Brevo/Cloudinary/Sentry fails? Is the status truthful? |
| I. OFFLINE / RECONNECT | What happens when connectivity disappears/reappears? Request storm? |
| J. AUTHORIZATION | What happens if someone calls the underlying serverFn directly, without the UI? |
| K. HISTORICAL INTEGRITY | Will old orders/receipts/audit records remain truthful? |
| L. CACHE INVALIDATION | Does stale UI remain indefinitely? What invalidates it? |
| M. DERIVED DATA | Analytics, Best Sellers, counts, badges, totals, notifications — recomputed or stale? |
| N. USER FEEDBACK | Does the customer/Admin understand what happened? |
| O. REVERSIBILITY | Can an accidental Admin action be corrected safely? |
| P. PROVIDER/DB DIVERGENCE | Provider succeeded + DB failed, or DB succeeded + provider failed? |
| Q. DEPENDENCY REMOVAL | What breaks if the parent entity/category/product is removed? |

## Required Output Format

For each scenario return a block:

```
FEATURE=
TRIGGER=
DEPENDENT_SYSTEMS=
CURRENT_BEHAVIOR=
PROVEN_BY=          (code path / schema / runtime evidence — never assumption)
FAILURE_MODE=
SEVERITY=           CRITICAL | HIGH | MEDIUM | LOW | INFORMATIONAL
CLASSIFICATION=     PROVEN ISSUE | LIKELY RISK | SAFE BY EXISTING DESIGN | OWNER BUSINESS DECISION REQUIRED
CUSTOMER_IMPACT=
ADMIN_IMPACT=
FINANCIAL_IMPACT=
SECURITY_IMPACT=
HISTORICAL_DATA_IMPACT=
CACHE_IMPACT=
RECOMMENDED_GUARD=
TEST_REQUIRED=
OWNER_DECISION_REQUIRED=
```

## Rules

1. Do NOT claim bugs without code/schema/runtime evidence. "SAFE BY EXISTING DESIGN" requires naming the guard.
2. Severity reflects real blast radius: financial loss, data loss, security exposure > broken feature > cosmetic.
3. A finding is only actionable if it names the guard that closes it.
4. This skill does NOT replace Owner review, independent audits, or tests — it feeds them.
5. Never mark PROVEN ISSUE fixed without a test or verification command.

## Workflow

1. Enumerate the feature's write paths and their dependents (grep schema references, FK graph).
2. Walk every applicable lens above.
3. Output findings in the required format, ordered by severity.
4. Fix every PROVEN CRITICAL/HIGH before code-complete; re-run the gate after.
