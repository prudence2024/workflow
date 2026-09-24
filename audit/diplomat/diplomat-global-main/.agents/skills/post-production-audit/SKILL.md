---
name: post-production-audit
description: Pre-launch production-readiness audit covering SEO, accessibility, performance, security, metadata, and deployment verification. Use before launch or after major releases.
version: 1.0.0
source: Adapted from Prudence Codex post-production skill
---

# Post-Production Audit

Coordinate evidence-based production-readiness audit.

## Audit Domains

### SEO
- sitemap.xml completeness
- robots.txt correctness
- llms.txt presence
- OpenGraph metadata
- Twitter cards
- Schema.org structured data
- Canonical URLs
- Meta descriptions

### Accessibility
- Keyboard navigation
- Focus management
- ARIA labels
- Color contrast
- Form labels
- Alt text
- Semantic HTML

### Performance
- TTFB < 800ms
- FCP < 1.8s
- LCP < 2.5s
- CLS < 0.1
- Image optimization
- JS bundle size
- Third-party script impact

### Security
- CSP headers
- HSTS
- X-Frame-Options
- Secret exposure
- Input validation
- Auth/RBAC

### Deployment
- Build passes
- No runtime errors
- Environment variables
- Domain configuration
- SSL/TLS

## Workflow
1. Run each specialist check
2. Collect findings
3. Prioritize by severity
4. Fix BLOCKER/CRITICAL/HIGH
5. Document MEDIUM/LOW
6. Verify fixes
7. Generate readiness report

## Evidence Required
- Actual measurements (not claims)
- Before/after comparisons
- Runtime verification where possible
