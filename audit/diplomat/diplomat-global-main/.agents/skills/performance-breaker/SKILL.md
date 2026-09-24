---
name: performance-breaker
description: Adversarial performance testing. Profile routes, find bottlenecks, break assumptions about load time. Use when investigating slow pages, high TTFB, or client/server waterfalls.
version: 1.0.0
source: Diplomat Global Engineering Standards
---

# Performance Breaker

The permanent performance question: **MEASURE FIRST, FIX SECOND.**

## Workflow

1. **MEASURE** — Profile actual route performance (TTFB, FCP, LCP, CLS)
2. **WATERFALL** — Build request waterfall for each slow route
3. **IDENTIFY** — Find the actual bottleneck (not guessed)
4. **RANK** — P0/P1/P2/P3 by measured impact
5. **FIX** — Smallest change with biggest measured improvement
6. **RE-MEASURE** — Prove the fix actually improved performance
7. **REGRESSION** — Ensure other routes didn't slow down
8. **COMMIT** — Clean build, conventional message

## What is NOT Evidence

- "Feels faster"
- Build passed
- Code looks optimized
- Previous report says PASS
- Source inspection only

## Measurement Checklist

For each route capture:
- TTFB (Time to First Byte)
- FCP (First Contentful Paint)
- LCP (Largest Contentful Paint)
- CLS (Cumulative Layout Shift)
- Request count
- ServerFn count
- JS transferred
- CSS transferred
- Image bytes

## Common Bottlenecks

### Server-Side
- Sequential database queries (could be parallel)
- N+1 queries
- Missing indexes
- Unnecessary data fetching
- Clerk session verification on public routes

### Client-Side
- Redundant serverFn calls after SSR hydration
- Client-side data fetching that SSR already provides
- Heavy JS bundles (Admin code in public routes)
- Third-party scripts blocking render

### Network
- Oversized images (no Cloudinary transforms)
- Lazy-loaded LCP elements
- Missing font preloads
- Render-blocking CSS/JS

### Architecture
- Root loader fetching data unused by child routes
- Header/footer fetching data already in root loader
- Components making independent serverFn calls that could share one

## Performance Budget

| Metric | Target |
|---|---|
| TTFB | < 800ms |
| FCP | < 1.8s |
| LCP | < 2.5s |
| CLS | < 0.1 |

## Assumption Table

Every significant performance fix produces:

```
ASSUMPTION:       [what we believe about the bottleneck]
HOW TO BREAK IT:  [measurement that tests it]
EXPECTED:         [safe behavior if wrong]
TEST:             [what was measured]
EVIDENCE:         [before/after numbers]
RESULT:           [PASS / FAIL / NOT TESTED]
```

## Key Rules

- Never call something fast without numbers
- Skeleton screens are not performance fixes
- Parallelize independent async operations
- Eliminate redundant client fetches when SSR provides data
- Don't fetch ALL records when you need 3
- Don't block public content on Admin auth
- Third-party failures must not block public content
