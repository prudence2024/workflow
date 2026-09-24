---
name: requirements-auditor
description: Audit project requirements coverage against implementation. Track which requirements are implemented, tested, and live. Use when verifying feature completeness or preparing for launch.
version: 1.0.0
source: Diplomat Global Engineering Standards
---

# Requirements Auditor

Compare project requirements against actual implementation state.

## Audit Process

### 1. Gather Requirements Sources
- AGENTS.md rules
- README documentation
- docs/ specifications
- Owner-approved instructions
- Migration plans
- Previous audit reports

### 2. For Each Requirement, Determine
- IMPLEMENTED: Code exists
- TESTED: Evidence of testing
- LIVE: Deployed and working
- DOCUMENTED: Accurate in docs
- REGRESSION: Previously working, now broken

### 3. Classification
- COMPLETE: Implemented + Tested + Live + Documented
- PARTIAL: Some aspects missing
- CLAIMED: Documented but not implemented
- IMPLEMENTED: Code exists but not tested/live
- BLOCKED: Depends on unresolved dependency
- MISSING: Not yet addressed

### 4. Output Format
```
REQUIREMENT:
STATUS: COMPLETE / PARTIAL / CLAIMED / IMPLEMENTED / BLOCKED / MISSING
IMPLEMENTATION: [where]
TEST: [evidence]
RUNTIME: [status]
GAPS: [what's missing]
```

### 5. Key Requirements to Audit
- Authentication (Clerk)
- Authorization (RBAC)
- Admin Dashboard
- Products/Catalog
- Cart/Checkout
- Payments (Paystack)
- Coupons
- Orders
- Inventory
- Reviews/Testimonials
- Contact Form
- Newsletter
- Blog/CMS
- Telegram Bot
- Email (Resend/Brevo)
- SEO (sitemap, robots, llms.txt)
- Performance
- Security Headers
- Audit Logging
- Error Handling
