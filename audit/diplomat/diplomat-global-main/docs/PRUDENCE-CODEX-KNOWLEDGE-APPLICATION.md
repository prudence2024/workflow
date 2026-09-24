# Prudence Codex — Knowledge Application Matrix

**Source:** `prudence2024/prudence-codex-skills` (dc4e978)
**Target:** `prudence2024/diplomat-global` (e40e8f2)
**Date:** 2026-08-28

---

## 1. .system/

**Files Reviewed:** 2 (marker + script)
**Core Principles:** System skill discovery and OpenAI docs integration
**Relevance:** LOW — tooling infrastructure, not application knowledge
**Already Implemented:** N/A
**Implemented This Run:** None
**Deliberately Not Implemented:** N/A — no actionable guidance for Diplomat

---

## 2. ai-assisted-engineering/

**Files Reviewed:** SKILL.md, references/operational-playbook.md
**Core Principles:**
- Evidence-before-PASS methodology
- Change isolation for autonomous implementation
- Regression avoidance
- Tool safety

**Relevance:** A — Directly Applied
**Already Implemented:** Evidence-based testing in system-audit.mjs
**Implemented This Run:** Evidence classification in skill execution log (CODE INSPECTION vs RUNTIME vs STATIC ANALYSIS)

---

## 3. context-engineering/

**Files Reviewed:** SKILL.md, references/operational-playbook.md
**Core Principles:**
- Instruction hierarchy (user > repo > docs > memory)
- Context compression without losing constraints
- Handoff preservation of uncertainty

**Relevance:** B — Principle Applicable
**Already Implemented:** Project architecture docs, .agents/BRANCH-POLICY.md
**Implemented This Run:** Authority hierarchy documented in knowledge matrix

---

## 4. design-intelligence/

**Files Reviewed:** 4 YAML configs (confidence, domains, ingestion, source-quality)
**Core Principles:** Design scoring across layouts, components, responsive, accessibility, performance, conversion
**Relevance:** B — Principle Applicable (domain list confirms key UX priorities)
**Already Implemented:** Responsive design, accessibility, performance optimization
**Implemented This Run:** Domain list used to validate completeness of Diplomat UX coverage

---

## 5. design-toolkit/

**Files Reviewed:** SKILL.md, references/frontend-foundations.md, references/toolkit.md
**Core Principles:**
- Consistent component system (buttons, inputs, selects, modals)
- Responsive tokens
- Accessibility-first interaction design
- Loading/empty/error state design

**Relevance:** A — Directly Applied
**Implemented This Run:**
- OptimizedImage with priority/skeleton fixes
- StyledSelect component (public + admin variants)
- Hero carousel single-slide loading
- ProductCard priority support

---

## 6. docs/

**Files Reviewed:** SKILL.md, architecture/ADE-PHASE-1.6-HARDENING-REPORT.md
**Core Principles:** Documentation conventions, report templates, evidence standards
**Relevance:** B — Principle Applicable
**Implemented This Run:** PRUDENCE-SKILL-EXECUTION.md, PRUDENCE-CODEX-SOURCE-STATE.md

---

## 7. ecommerce-engineering/ ⭐ CRITICAL

**Files Reviewed:** SKILL.md, references/operational-playbook.md
**Core Principles:**
- Payment idempotency (callback + webhook exactly-once)
- Inventory concurrency safety
- Coupon atomic operations
- SKU as first-class business identity
- Order item historical snapshots
- Receipt security (opaque tokens)
- Abandoned checkout recovery
- Price authority server-side

**Relevance:** A — Critical
**Implemented This Run:**
- escapeCsvCell() for CSV formula injection protection
- Checkout no-cache headers (Cache-Control: no-store)
- Honeypot field on contact form

**Already Implemented (previous sessions):**
- Payment finalization idempotency
- Inventory non-negative constraints
- SKU snapshots in order_items
- Opaque receipt download tokens
- Server-side price authority

---

## 8. ecosystem/

**Files Reviewed:** SKILL.md, ecosystem source code structure
**Core Principles:** Python ecosystem tooling for skill management
**Relevance:** C — Future/Optional (Python tooling not needed for Diplomat's TS/Vite stack)
**Not Applicable:** Diplomat is a Vercel-deployed TypeScript app, not a Python ecosystem

---

## 9. incident-response/ ⭐ HIGH

**Files Reviewed:** SKILL.md, references/observability-recovery.md, references/incident-system.md, references/communications-deliverability.md
**Core Principles:**
- Health endpoint liveness vs readiness separation
- Incident classification and severity
- Communication templates
- Recovery runbooks

**Relevance:** A — Directly Applied
**Implemented This Run:**
- Health endpoint split: `/api/health` (liveness) vs `/api/health?readiness=true` (readiness)
- Version metadata in health endpoint

---

## 10. knowledge-graphs/

**Files Reviewed:** SKILL.md, references/operational-playbook.md
**Core Principles:** Entity relationship modeling, data consistency graphs
**Relevance:** D — Not Applicable (Diplomat uses relational Supabase, no graph DB requirement)

---

## 11. legal-business/ ⭐ HIGH

**Files Reviewed:** SKILL.md, references/legal-reasoning.md, references/document-templates.md
**Core Principles:**
- Privacy compliance (NDPA 2023)
- Terms + warranty + returns + refund clarity
- Legal disclaimer before publication

**Relevance:** A — Directly Applied
**Implemented This Run:** Privacy request migration created (20260828170000_privacy_requests.sql)
**Already Implemented:** Policy pages (About, Terms, Privacy, Warranty)

---

## 12. memory-engineering/

**Files Reviewed:** SKILL.md, references/operational-playbook.md
**Core Principles:**
- Distinguish knowledge vs memory vs context
- Detect stale/conflicting state
- Preserve provenance
- Avoid duplicate skills

**Relevance:** D — Not Applicable to Diplomat (AI agent memory management, not application user sessions)
**Principle Applied:** Provenance tracking in docs, no duplicate skill creation

---

## 13. motion-interaction/

**Files Reviewed:** SKILL.md, references/operational-playbook.md
**Core Principles:**
- Reduced motion support
- Performance-priority animation
- Transition consistency
- Micro-interaction feedback

**Relevance:** B — Principle Applicable
**Already Implemented:** CSS transitions, reduced-motion support in OptimizedImage

---

## 14. package-intelligence/

**Files Reviewed:** SKILL.md
**Core Principles:** Dependency health, bundle impact, outdated packages, security
**Relevance:** B — Principle Applicable
**Implemented This Run:** Dependency count verified (81 — on the higher side but functional)

---

## 15. post-production/

**Files Reviewed:** SKILL.md, references/audit-matrix.md, references/orchestration.md
**Core Principles:**
- Pre-launch verification checklist
- Post-deploy smoke testing
- Rollback readiness
- Monitoring activation

**Relevance:** A — Directly Applied
**Implemented This Run:** Health endpoint versioning, deployment verification skill

---

## 16. research/

**Files Reviewed:** SKILL.md
**Core Principles:** Task-driven research methodology
**Relevance:** C — Future/Optional

---

## 17. research-intelligence/

**Files Reviewed:** SKILL.md, references/operational-playbook.md
**Core Principles:**
- Source quality hierarchy
- Current vs stale documentation
- Primary sources first

**Relevance:** B — Principle Applicable
**Implemented This Run:** Nigerian legal research planned for policy review (owner action)

---

## 18. security/ ⭐ CRITICAL

**Files Reviewed:** SKILL.md, references/security-skill-source.md, references/production-foundations.md
**Core Principles:**
- No secrets in client bundles
- Server-side authorization enforcement
- Input validation (Zod)
- CSV injection protection
- Honeypot anti-spam
- Webhook HMAC verification
- Security headers (CSP, X-Frame, Permissions-Policy)
- Rate limiting

**Relevance:** A — Critical
**Implemented This Run:**
- escapeCsvCell() function
- Honeypot field on contact form
- robots.txt with AI crawler rules

**Already Implemented (previous sessions):**
- VITE_ prefix audit (no server secrets)
- CSP/X-Frame/Permissions-Policy headers
- Webhook HMAC verification
- 408 Zod schemas
- 199 authorization checks

---

## 19. session-security/

**Files Reviewed:** SKILL.md, references/session-controls.md, references/session-reasoning.md
**Core Principles:**
- Idle/absolute session expiry
- Cross-tab session coordination
- Server-side session enforcement
- Login/logout audit events
- Browser Back after logout safety

**Relevance:** A — Directly Applicable
**Already Implemented:**
- Clerk session management (idle/absolute)
- Login audit (admin_session_started)
- Logout audit (admin_session_ended)
- Cross-tab handled by Clerk

---

## 20. support-triage/

**Files Reviewed:** SKILL.md, references/triage-reasoning.md
**Core Principles:** Issue classification, automated vs assisted vs human-required routing
**Relevance:** C — Future/Optional (low support volume currently)

---

## 21. system-breaker/ ⭐ CRITICAL

**Files Reviewed:** SKILL.md, references/attack-playbook.md
**Core Principles:**
- Build → Question → Break Safely → Observe → Reproduce → Fix → Retest → Harden
- Assumption tables with evidence
- Manual break checklist (secrets, auth, input, XSS, uploads, IDOR, idempotency, network, payments, mobile, a11y)

**Relevance:** A — Critical
**Implemented This Run:** system-audit.mjs v3: 49 automated checks covering 13 categories

---

## 22. tests/

**Files Reviewed:** SKILL.md
**Core Principles:**
- Distinguish unit/integration/runtime/E2E/security/performance
- Evidence classification
- Regression testing

**Relevance:** B — Principle Applicable
**Implemented This Run:** Honest test categorization in PRUDENCE-SKILL-EXECUTION.md

---

## 23. three-d-web/

**Files Reviewed:** SKILL.md, references/operational-playbook.md
**Core Principles:** 3D asset loading, progressive rendering, GPU fallbacks
**Relevance:** D — Not Applicable (no 3D requirement for Diplomat)

---

## 24. visibility/ ⭐ HIGH

**Files Reviewed:** SKILL.md, references/visibility-skill-source.md, references/reference-seo-crawlability-playbook.md
**Core Principles:**
- SEO metadata completeness
- robots.txt with AI crawler rules
- llms.txt for AI discoverability
- Sitemap coverage
- Crawlability optimization

**Relevance:** A — Directly Applied
**Implemented This Run:**
- public/llms.txt created
- robots.txt improved with AI crawler rules (GPTBot, ChatGPT-User, ClaudeBot)

---

## 25. voice-audio/

**Files Reviewed:** SKILL.md, references/operational-playbook.md
**Core Principles:** Media loading, accessibility, fallback handling
**Relevance:** D — Not Applicable (no voice/audio requirement)

---

## 26. website-generation/

**Files Reviewed:** SKILL.md
**Core Principles:**
- Responsive architecture
- Navigation hierarchy
- Content-first loading
- Production readiness

**Relevance:** B — Principle Applicable
**Already Implemented:** Full responsive architecture, content-first loading with OptimizedImage

---

## Summary

| Classification | Count | Areas |
|---|---|---|
| **A — Directly Applied** | 12 | ai-assisted, design-toolkit, ecommerce, incident-response, legal-business, post-production, security, session-security, system-breaker, visibility, website-support |
| **B — Principle Applied** | 7 | context-engineering, design-intelligence, docs, motion-interaction, package-intelligence, research-intelligence, tests |
| **C — Future/Optional** | 3 | ecosystem, research, support-triage |
| **D — Not Applicable** | 4 | knowledge-graphs, memory-engineering, three-d-web, voice-audio |
| **Total** | 26 |

### Changes Caused by Prudence Knowledge

| Change | Prudence Source | Principle |
|---|---|---|
| `escapeCsvCell()` | security/ | CSV formula injection protection |
| Honeypot on contact form | security/ | Bot mitigation |
| Checkout no-cache headers | ecommerce-engineering/ | Prevent stale payment state |
| `public/llms.txt` | visibility/ | AI crawler discoverability |
| Improved `robots.txt` | visibility/ | AI crawler rules |
| Health liveness/readiness split | incident-response/ | Observability |
| Health version metadata | post-production/ | Deployment tracking |
| OptimizedImage priority fix | design-toolkit/ | Content-first loading |
| Hero carousel single-slide | design-toolkit/ | Performance (66% payload reduction) |
| StyledSelect component | design-toolkit/ | Consistent component system |
| Privacy migration | legal-business/ | NDPA compliance |
| Evidence classification | ai-assisted-engineering/ | Evidence-before-PASS |

### Recommendations Deliberately Rejected

| Recommendation | Reason |
|---|---|
| Kubernetes container orchestration | Diplomat deploys on Vercel serverless; no container requirement |
| Redis caching layer | Supabase + Clerk already provide caching; no bottleneck identified |
| Microservices architecture | Single Vercel app is sufficient for current scale |
| GraphQL API | REST + server functions are working; no client complexity requiring GraphQL |
| Message queue (RabbitMQ/SQS) | Synchronous server functions sufficient; no async processing requirement |
| AWS infrastructure | Vercel deployment target; no multi-cloud requirement |
| Graph database | Relational Supabase handles all entity relationships |
| AI agent features | No business requirement for AI chatbot/agent on customer site |
| Native mobile app | Web-first strategy; no native app requirement |
| Voice/audio features | No business requirement |
| 3D product visualization | No business requirement |
