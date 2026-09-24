# Codex Prudence Skill Execution

Reading a skill contract is discovery, not execution. Results remain `PENDING` until the workflow is actually exercised against Diplomat Global. The external Prudence repository is read-only.

## Inventory

- Diplomat project skills discovered: 17
- External Prudence `SKILL.md` files discovered: 21
- Full-system-audit is explicitly deferred until all specialist remediation and verification is complete.

| SKILL | SOURCE | APPLICABILITY | EXECUTED | STATIC_EVIDENCE | AUTOMATED_EVIDENCE | RUNTIME_EVIDENCE | ATTACK_EVIDENCE | FINDINGS | FIX | RETEST | RESULT |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cross-project-guard | Project | APPLICABLE | YES | Root/remote/branch verified | — | Vercel identity remains unverified | LittleReads excluded | Correct Diplomat Git identity; deployment identity incomplete | No deployment attempted | Repeated before external provider cleanup | PARTIAL |
| requirements-auditor | Project | APPLICABLE | YES | Forensic baseline accepted by Owner; category requirements mapped independently | Category acceptance fields recorded | Exact artifact category boundary recorded | Prior category PASS claims challenged | Owner register tracks runtime versus authenticated/visual gaps | Category evidence updated | Register reconciled to `46f63e7` | PARTIAL |
| session-guard | Project | APPLICABLE | NO | — | — | — | — | Pending | — | — | PENDING |
| ui-ux-breaker | Project | APPLICABLE | PARTIAL | Footer and digital receipt hierarchy, responsive containment, print behavior, link semantics, and authoritative-data boundaries reviewed | Receipt/payment focused 30/30; full suite 243/243 | Exact artifact proves receipt document contract and opaque-token denial | Long names, narrow layout, print layout, XSS values, missing identity, and invalid tokens exercised | Receipt used hardcoded paper identity and live rows; browser viewport remains unavailable | Blue/white responsive receipt, mobile item cards, A4 print CSS, Settings identity, immutable snapshots | Exact compiled renderer passes; browser/Owner visual pending | PARTIAL |
| auth-rbac-breaker | Project | APPLICABLE | NO | — | — | — | — | Pending | — | — | PENDING |
| security-audit | Project | APPLICABLE | NO | — | — | — | — | Pending | — | — | PENDING |
| system-attacker | Project | APPLICABLE | NO | — | — | — | — | Pending | — | — | PENDING |
| system-breaker | Project | APPLICABLE | YES | Upload, category, coupon, Footer, inventory, payment, and receipt authority traced | Receipt/payment focused 30/30; full repository suite 243/243 | Exact built artifact proves opaque-token denial and compiled immutable receipt rendering | Invalid/guessed tokens, unfinalized payment, inconsistent snapshots, XSS, free delivery, and refresh tested | Receipt renderer trusted live joins and hardcoded business identity; transaction-wide side-effect crash recovery remains open | Shared immutable receipt document and finalized-payment access boundary | TypeScript/build/artifact pass; Owner visual and durable outbox remain pending | PARTIAL |
| checkout-breaker | Project | APPLICABLE | YES | Browser input, server product authority, coupon/delivery calculation, quote persistence, retry identity, and cart completion reviewed | 20 checkout/payment tests plus 13 coupon tests pass | Exact artifact negative callback/success/token paths pass; no real payment initiated | Browser price/name rejected; stale/incompatible attempts rotate; invalid free-delivery configuration fails closed | Browser trusted price/name and indefinite attempt reuse removed | One server quote and 30-minute semantic retry boundary | Full 233/233, TypeScript, build, artifact, lint, and diff gates pass | PARTIAL |
| payments-paystack-test | Project | APPLICABLE | NO | — | — | Local invalid-signature gate only | Forged local webhook returned 400 | Preview protection remains unresolved | No payment attempted | Pending exact Preview | BLOCKED |
| database-integrity | Project | APPLICABLE | NO | — | — | — | — | Migration preflights pending | — | — | PENDING |
| performance-breaker | Project | APPLICABLE | NO | — | — | — | — | Pending | — | — | PENDING |
| seo-discoverability | Project | APPLICABLE | NO | — | — | Local robots/llms/sitemap issues observed | — | Deferred to ordered phase | — | — | PENDING |
| telegram-ops-test | Project | APPLICABLE | NO | — | — | — | — | Registration error pending diagnosis | — | — | PENDING |
| deployment-verifier | Project | APPLICABLE | PARTIAL | Vercel output contract confirmed | Receipt commit `bbcb527`: focused 30/30, full 243/243, TypeScript exit 0 | Working-tree artifact smoke plus clean detached `npm ci`/build pass | Malformed and guessed receipt tokens denied; compiled receipt renderer exercised | Remote Vercel identity not established | Receipt commit has no local-only runtime dependency | Clean committed build exit 0 | PARTIAL |
| post-production-audit | Project | PARTIALLY_APPLICABLE | NO | Release-candidate only | — | — | — | Not yet applicable | — | — | DEFERRED |
| full-system-audit | Project | APPLICABLE_LAST | NO | Explicitly prohibited until last | — | — | — | Prerequisites incomplete | — | — | DEFERRED |
| ai-assisted-engineering | External Prudence | PARTIALLY_APPLICABLE | NO | Contract read pending | — | — | — | Classification pending full read | — | — | PENDING |
| context-engineering | External Prudence | PARTIALLY_APPLICABLE | NO | Contract read pending | — | — | — | Classification pending full read | — | — | PENDING |
| design-toolkit | External Prudence | APPLICABLE | NO | Contract read pending | — | — | — | Mobile/UI phase | — | — | PENDING |
| ecommerce-engineering | External Prudence | APPLICABLE | PARTIAL | Contract/playbook applied to quote, payment, coupon, inventory, receipt, and retry boundaries | Receipt/payment focused 30/30; full 243/243 | Exact artifact receipt denial/rendering pass; historical payment unchanged | Unfinalized access, immutable snapshot inconsistency, token guessing, XSS, and receipt-pending state exercised | Canonical receipt ownership fixed; process-crash side-effect recovery remains open | Immutable receipt values, Settings identity, payment-authoritative access, nonblocking email semantics | TypeScript, clean committed build, artifact, lint, and diff pass | PARTIAL |
| incident-response | External Prudence | APPLICABLE | NO | Contract read pending | — | — | — | Provider/Sentry/health phase | — | — | PENDING |
| knowledge-graphs | External Prudence | NOT_APPLICABLE | NO | Contract read pending | — | — | — | No graph-memory scope | — | — | PENDING_CLASSIFICATION |
| legal-business | External Prudence | PARTIALLY_APPLICABLE | NO | Contract read pending | — | — | — | Privacy/Terms/contact consent only | — | — | PENDING |
| memory-engineering | External Prudence | NOT_APPLICABLE | NO | Contract read pending | — | — | — | No AI-memory scope | — | — | PENDING_CLASSIFICATION |
| motion-interaction | External Prudence | PARTIALLY_APPLICABLE | NO | Contract read pending | — | — | — | Interaction/mobile polish phase | — | — | PENDING |
| package-intelligence | External Prudence | PARTIALLY_APPLICABLE | NO | Contract read pending | — | — | — | Provider/package review phase | — | — | PENDING |
| post-production | External Prudence | APPLICABLE_LAST | NO | Contract read pending | — | — | — | Release gate not reached | — | — | DEFERRED |
| research-intelligence | External Prudence | PARTIALLY_APPLICABLE | NO | Contract read pending | — | — | — | Provider/current-doc verification | — | — | PENDING |
| security | External Prudence | APPLICABLE | NO | Contract read pending | — | — | — | Security phase | — | — | PENDING |
| session-security | External Prudence | APPLICABLE | NO | Contract read pending | — | — | — | Maps to project session-guard | — | — | PENDING |
| support-triage | External Prudence | PARTIALLY_APPLICABLE | NO | Contract read pending | — | — | — | Owner defect evidence model | — | — | PENDING |
| system-breaker | External Prudence | APPLICABLE | PARTIAL | Contract read and methodology applied | Upload policy tests | Provider and preview probes | Invalid uploads and forged webhook | Same findings as project adaptation | In progress | Focused tests pass | PARTIAL |
| three-d-web | External Prudence | NOT_APPLICABLE | NO | Contract read pending | — | — | — | No 3D scope | — | — | PENDING_CLASSIFICATION |
| visibility | External Prudence | APPLICABLE | NO | Contract read pending | — | — | — | SEO/release phase | — | — | PENDING |
| voice-audio | External Prudence | NOT_APPLICABLE | NO | Contract read pending | — | — | — | No voice/audio scope | — | — | PENDING_CLASSIFICATION |
| website-generation | External Prudence | PARTIALLY_APPLICABLE | NO | Contract read pending | — | — | — | Existing-app UI evaluation only | — | — | PENDING |
| sample-skill | External test fixture | NOT_APPLICABLE | NO | Fixture, not an application skill | — | — | — | Excluded from executable inventory | — | — | NOT_APPLICABLE |

## Execution order

The required project specialist order remains authoritative. External skills will be interleaved only where their complete contracts map to the active domain. `full-system-audit` and external `post-production` remain last-stage gates.
