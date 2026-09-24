# Complete Skill Inventory — Owner Request (§9)

Every discovered skill, described from its actual SKILL.md. Two locations:
`~/.claude/skills` (user-level, 46) and `.agents/skills` (project-level, 17).
Total: **63** (one, user-level `criticism`, has an empty directory with no SKILL.md).

Legend: RELEVANT = directly usable on Diplomat Global work. PARTIAL = occasional use.
NO = not applicable to this project.

## User-level skills (`~/.claude/skills`)

| # | SKILL_NAME | LOCATION | DESCRIPTION (from SKILL.md) | CATEGORY | RELEVANT_TO_DIPLOMAT_GLOBAL |
|---|---|---|---|---|---|
| 1 | 21st-ai | ~/.claude/skills/21st-ai | Generate and iterate on UI with the `21st` CLI: sketch a UI from a prompt, preview variants in the browser, edit a variant with a natural-language change, and pull components. | UI generation tooling | PARTIAL |
| 2 | 21st-cli-use | ~/.claude/skills/21st-cli-use | Search, install and pull code from the 21st.dev catalog: find React/shadcn components, themes and templates, print component code or theme CSS, install into the project. | UI generation tooling | PARTIAL |
| 3 | 21st-design-sync | ~/.claude/skills/21st-design-sync | Reads the project's shadcn/Tailwind design tokens and publishes them to 21st.dev as a shareable community theme via `21st publish-theme`. | Design publishing | NO |
| 4 | 21st-registry | ~/.claude/skills/21st-registry | Publish your own work to 21st.dev and manage it: publish components to a team library, publish CSS themes or template listings, edit/unpublish/delete. | Design publishing | NO |
| 5 | 21st-ui-build | ~/.claude/skills/21st-ui-build | Build or substantially change production UI using the project's design context, existing components, and grounded 21st inspiration — for pages, sections, responsive redesigns, visual polish. | Frontend build | YES |
| 6 | 21st-ui-explore | ~/.claude/skills/21st-ui-explore | Explore and compare multiple meaningfully different UI directions grounded in the project's design system; for options, concepts, redesign directions, visual experimentation. | Frontend design exploration | PARTIAL |
| 7 | 21st-ui-review | ~/.claude/skills/21st-ui-review | Review existing UI against design context, accessibility expectations, responsive behavior, interaction quality and production rules — UI audits, design QA, frontend review. | Frontend review | YES |
| 8 | animate | ~/.claude/skills/animate | Build an animation from scratch in the order that determines whether it feels right: should it animate, what purpose, which tool/properties/curve/duration, interruption and exit. Writes the implementation. | Motion | YES |
| 9 | animate-expo | ~/.claude/skills/animate-expo | The same animation decision framework for React Native/Expo: thread choice, properties, spring vs timing, gesture handoff, degradation. Writes the implementation. | Motion (mobile) | NO |
| 10 | animation-vocabulary | ~/.claude/skills/animation-vocabulary | Reverse-lookup glossary turning a vague description of a web animation into its exact term ("the bouncy thing when a popover opens" → Pop in). | Motion reference | PARTIAL |
| 11 | apple-design | ~/.claude/skills/apple-design | Apple's interface-design and fluid physical-motion approach translated for the web: gesture-driven UI, springs, drag/sheet interactions, momentum, translucent materials, depth. | Motion / design language | PARTIAL |
| 12 | ask-sonner | ~/.claude/skills/ask-sonner | Guide to Sonner toasts: install and wire the Toaster, pick the right toast() call, promise/loading toasts, updating, dismissing, persisting, styling, positioning. | UI component guide | YES (admin toasts) |
| 13 | banner-design | ~/.claude/skills/banner-design | Design banners for social media, ads, website heroes, creative assets and print with multiple art directions and AI-generated visuals. | Marketing design | NO |
| 14 | brand | ~/.claude/skills/brand | Brand voice, visual identity, messaging frameworks, asset management, brand consistency; for branded content, tone of voice, style guides. | Branding | PARTIAL |
| 15 | criticism | ~/.claude/skills/criticism | **Directory exists but is EMPTY — no SKILL.md.** Cannot describe contents; treat as broken/placeholder. | — | — |
| 16 | design | ~/.claude/skills/design | Comprehensive design skill: brand identity, tokens, UI styling, logo generation, corporate-identity program, HTML presentations, banner and icon design. | Design (general) | PARTIAL |
| 17 | design-system | ~/.claude/skills/design-system | Token architecture and component specifications: three-layer tokens (primitive→semantic→component), CSS variables, spacing/typography scales, component specs. | Design systems | YES |
| 18 | design-taste-frontend | ~/.claude/skills/design-taste-frontend | Anti-slop frontend skill for landing pages, portfolios, redesigns: infers design direction, ships non-templated interfaces, audit-first on redesigns. | Frontend design | YES |
| 19 | emil-design-eng | ~/.claude/skills/emil-design-eng | Encodes Emil Kowalski's philosophy on UI polish, component design, animation decisions and the invisible details that make software feel great. | Design engineering | YES |
| 20 | find-animation-opportunities | ~/.claude/skills/find-animation-opportunities | Search a codebase for places that don't animate but should, and reject what shouldn't. Read-only; proposes motion with exact values, does not implement. | Motion audit | PARTIAL |
| 21 | framer-motion-gestures | ~/.claude/skills/framer-motion-gestures | Official Framer Motion skill for gesture animations — drag, pan, tap, hover, focus, touch; drag constraints and gesture handling. | Motion | PARTIAL |
| 22 | framer-motion-layout | ~/.claude/skills/framer-motion-layout | Official Framer Motion skill for layout animations — shared layout transitions, layoutId, exit animations, AnimatePresence, reorderable lists. | Motion | PARTIAL |
| 23 | framer-motion-react | ~/.claude/skills/framer-motion-react | Official Framer Motion React integration — AnimatePresence, motion components, useAnimation, layout animations, Next.js patterns. | Motion | PARTIAL |
| 24 | framer-motion-scroll | ~/.claude/skills/framer-motion-scroll | Official Framer Motion skill for scroll-linked animation — useScroll, useTransform, scroll-triggered animations, parallax, progress indicators. | Motion | PARTIAL |
| 25 | framer-motion-variants | ~/.claude/skills/framer-motion-variants | Official Framer Motion skill for variants — state machines, orchestrated animations, stagger, repeat, sequencing. | Motion | PARTIAL |
| 26 | frontend-design | ~/.claude/skills/frontend-design | Guidance for distinctive, intentional visual design when building new UI or reshaping an existing one; aesthetic direction, typography, avoiding templated defaults. | Frontend design | YES |
| 27 | gsap-core | ~/.claude/skills/gsap-core | Official GSAP core API skill — to/from/fromTo, easing, duration, stagger, defaults, matchMedia for responsive and reduced-motion. | Motion (GSAP) | NO (project doesn't use GSAP) |
| 28 | gsap-frameworks | ~/.claude/skills/gsap-frameworks | Official GSAP skill for Vue/Svelte/other non-React frameworks — lifecycle, scoping, cleanup. | Motion (GSAP) | NO |
| 29 | gsap-performance | ~/.claude/skills/gsap-performance | Official GSAP performance skill — transforms, avoiding layout thrash, will-change, batching, 60fps. | Motion (GSAP) | NO |
| 30 | gsap-plugins | ~/.claude/skills/gsap-plugins | Official GSAP plugins skill — ScrollTo, ScrollSmoother, Flip, Draggable, Inertia, Observer, SplitText, CustomEase and more. | Motion (GSAP) | NO |
| 31 | gsap-react | ~/.claude/skills/gsap-react | Official GSAP React skill — useGSAP hook, refs, gsap.context(), cleanup in React/Next. | Motion (GSAP) | NO |
| 32 | gsap-scrolltrigger | ~/.claude/skills/gsap-scrolltrigger | Official GSAP ScrollTrigger skill — scroll-linked animation, pinning, scrub, triggers. | Motion (GSAP) | NO |
| 33 | gsap-timeline | ~/.claude/skills/gsap-timeline | Official GSAP timeline skill — sequencing, position parameter, nesting, playback choreography. | Motion (GSAP) | NO |
| 34 | gsap-utils | ~/.claude/skills/gsap-utils | Official GSAP skill for gsap.utils helpers — clamp, mapRange, normalize, interpolate, random, snap, toArray, wrap, pipe. | Motion (GSAP) | NO |
| 35 | impeccable | ~/.claude/skills/impeccable | Design, redesign, critique, audit, polish, harden, optimize or otherwise improve a frontend interface — sites, dashboards, product UI, app shells. | Frontend quality | YES |
| 36 | improve-animations | ~/.claude/skills/improve-animations | Survey a codebase's motion code as a senior motion advisor; produce a prioritized audit and self-contained implementation plans. Read-only. | Motion audit | PARTIAL |
| 37 | pick-ui-library | ~/.claude/skills/pick-ui-library | Pick the right library for a frontend task from a curated list — numbers, OTP inputs, charts, command menus, virtualization, dnd, toasts, state, styling. Explicit-invocation only. | Tooling choice | PARTIAL |
| 38 | playwright-cli | ~/.claude/skills/playwright-cli | Automate browser interactions, test web pages and work with Playwright tests through `playwright-cli`. | Browser QA tooling | YES |
| 39 | prototype | ~/.claude/skills/prototype | Build multiple genuinely different versions of a UI piece, rendered behind a visual picker to flip through live and promote one. Explicit-invocation only. | Frontend exploration | PARTIAL |
| 40 | react-bits | ~/.claude/skills/react-bits | Add animated UI components, text effects, cursor/hover effects or WebGL/canvas backgrounds via React Bits (reactbits.dev), or recall its components' code/props. | UI components | NO |
| 41 | review-animations | ~/.claude/skills/review-animations | Review animation/motion code against a high craft bar derived from Emil Kowalski's philosophy. Default to flagging; approval is earned. Explicit-invocation only. | Motion review | PARTIAL |
| 42 | slides | ~/.claude/skills/slides | Create strategic HTML presentations with Chart.js, design tokens, responsive layouts, copywriting formulas and contextual slide strategies. | Presentations | NO |
| 43 | ui-styling | ~/.claude/skills/ui-styling | Build beautiful, accessible UIs with shadcn/ui (Radix + Tailwind), Tailwind utility-first styling and canvas-based visuals; design systems and responsive layouts. | Frontend build | YES |
| 44 | ui-ux-pro-max | ~/.claude/skills/ui-ux-pro-max | UI/UX design intelligence for web/mobile/desktop when designing, building, reviewing or fixing interfaces — pages, components, systems, a11y, interaction, responsive, typography, color, charts. | Frontend design | YES |
| 45 | web-design-guidelines | ~/.claude/skills/web-design-guidelines | Review UI code for Web Interface Guidelines compliance — "review my UI", accessibility, design audit, UX best practices. (Vercel-authored.) | Frontend review | YES |
| 46 | write-swift | ~/.claude/skills/write-swift | How to write modern Swift well — value-type modeling, Swift 6 data-race safety, concurrency, protocols/generics, API design, performance, ARC, Swift Testing. | Mobile (Swift) | NO |

## Project-level skills (`.agents/skills`) — Diplomat-specific

| # | SKILL_NAME | LOCATION | DESCRIPTION (from SKILL.md) | CATEGORY | RELEVANT_TO_DIPLOMAT_GLOBAL |
|---|---|---|---|---|---|
| 47 | auth-rbac-breaker | .agents/skills/auth-rbac-breaker | Test and verify Admin authentication and RBAC authorization: break login flows, permission checks, role assignments. Adapted from Prudence Codex session-security. | Security QA | YES |
| 48 | checkout-breaker | .agents/skills/checkout-breaker | Test checkout-flow integrity: price authority, cart manipulation, delivery, coupons, inventory, order creation, payment initialization. | Commerce QA | YES |
| 49 | cross-project-guard | .agents/skills/cross-project-guard | Pre-flight check before destructive DB/deployment operations: verifies cwd, git remote, Supabase project ref and Vercel project all belong to the intended target; prevents cross-project contamination. | Safety guard | YES |
| 50 | database-integrity | .agents/skills/database-integrity | Inspect DB schema integrity, constraints, FK relationships, orphan risks, concurrency, schema drift. | Database QA | YES |
| 51 | deployment-verifier | .agents/skills/deployment-verifier | Verify committed code builds cleanly from a clean worktree; prevents "local-uncommitted-passes-while-deployment-fails". | Release QA | YES |
| 52 | full-system-audit | .agents/skills/full-system-audit | Orchestrate a complete system audit using the specialist skills: auth, security, payments, checkout, database, UI, deployment, Telegram. | Audit orchestration | YES |
| 53 | payments-paystack-test | .agents/skills/payments-paystack-test | Paystack test-mode E2E verification: payment flow, webhook, signature, idempotency, coupon, inventory, receipt. Test credentials only. | Payments QA | YES |
| 54 | performance-breaker | .agents/skills/performance-breaker | Adversarial performance testing: profile routes, find bottlenecks, break assumptions about load time; for slow pages, high TTFB, waterfalls. | Performance QA | YES |
| 55 | post-production-audit | .agents/skills/post-production-audit | Pre-launch production-readiness audit covering SEO, accessibility, performance, security, metadata, deployment verification. | Launch QA | YES |
| 56 | requirements-auditor | .agents/skills/requirements-auditor | Audit requirements coverage against implementation; track what is implemented, tested and live; for feature-completeness and launch verification. | Process QA | YES |
| 57 | security-audit | .agents/skills/security-audit | Production security assessment: secrets, auth, input handling, API security, uploads, payments, webhooks, headers, dependencies. | Security QA | YES |
| 58 | seo-discoverability | .agents/skills/seo-discoverability | SEO audit: sitemap, robots.txt, llms.txt, metadata, structured data, OpenGraph, Twitter cards, canonical URLs, AI discoverability. | Growth QA | YES |
| 59 | session-guard | .agents/skills/session-guard | Audit session-timeout behavior, idle/expiry handling, cross-tab coordination, auth-state consistency. | Security QA | YES |
| 60 | system-attacker | .agents/skills/system-attacker | Adversarial application attacker: tests assumptions from unauthorized, malicious, careless and edge-case perspectives; safe, never destructive against production. | Adversarial QA | YES |
| 61 | system-breaker | .agents/skills/system-breaker | Primary adversarial engineering methodology: build, question assumptions, break safely, verify, fix, retest, harden — for testing any feature or fix. | Adversarial QA | YES |
| 62 | telegram-ops-test | .agents/skills/telegram-ops-test | Test the Telegram Operations Bot: connectivity, webhook, commands, authorization, alerts, failure isolation. | Integrations QA | YES |
| 63 | ui-ux-breaker | .agents/skills/ui-ux-breaker | Test UI/UX across states, devices and edge cases: loading, empty, error, offline, mobile, accessibility. | UI QA | YES |

## Totals

```
TOTAL_SKILLS=63
TOTAL_SKILLS_DESCRIBED=62 (user-level 'criticism' has an empty directory — no SKILL.md to read)
TOTAL_RELEVANT=28 YES · 12 PARTIAL · 23 NO (per tables above)
USER_LEVEL=46  PROJECT_LEVEL=17
```
