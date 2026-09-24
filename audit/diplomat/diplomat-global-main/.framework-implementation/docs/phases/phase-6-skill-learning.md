# Phase 6 report — Research & Skill Learning Framework

## Status

Completed on 2026-07-30.

## Implemented

- Approved external source schema and policy
- Version, hash, URL, publisher, authority, license, freshness, and approval
  provenance
- Paraphrased claim model
- Exact first-party skill revision hashing
- Capability-gap and stale-guidance comparison
- Shared-upstream deduplication
- Community corroboration gate
- Evidence confidence and explanation
- Recommendation records with alternatives and trade-offs
- Separate immutable human decision records
- Protected-content before/after verification
- Recommendation and run reports
- Validation and CLI
- Explicit absence of automatic application

## Architectural decisions

- Do not bundle claims presented as current external truth without a reviewed
  source record.
- Reject unapproved or schema-invalid sources rather than using them with lower
  confidence.
- Require independent corroboration for community-only evidence.
- Hash the complete discovered skill and `.system` surface before and after every
  comparison.
- Write only under `research/recommendations`, `research/reports`, and
  `research/decisions`.
- Keep approval separate from implementation. An approved recommendation still
  requires a later, explicitly authorized repository change.
- Expose no apply command.

## Validation

- Focused Skill Learning tests: 6 passed
- Full repository suite: 83 passed
- Integrated Skill Learning validation: pass
- Approved production sources: zero
- Production recommendations: zero
- Production decisions: zero
- `.system` or first-party mutations by research tests: zero

## Checks not run

- Live external retrieval
- Comparison against a real approved current source set
- Human review of a production recommendation
- Separately approved recommendation implementation
- Scheduled or recurring research execution

## Remaining work

Phase 7 must validate registry, Shared Context, skills, both frameworks,
reporting, documentation, tests, and backward compatibility, then produce the
final engineering report.
