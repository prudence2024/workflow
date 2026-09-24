# Phase 5 report — Design Intelligence Framework

## Status

Completed on 2026-07-30.

## Implemented

- Fail-closed ZIP website ingestion
- Untrusted-content and secret handling
- Git-ignored raw archive storage
- Tracked source manifests and archive hashes
- Static pattern extraction without code execution
- JSONL observation evidence
- Independence-group deduplication
- Weighted confidence scoring with a conservative bound
- Accessibility, performance, usability, outcome, and contradiction-aware
  recommendation scoring
- Human-gated established classification
- Domain-organized normalized knowledge
- Provenance tracking
- Structured multi-filter querying
- Integrated validation and CLI
- Security, scoring, normalization, query, and compatibility tests

## Architectural decisions

- Accept ZIP only in the initial implementation to keep archive security
  deterministic.
- Reject an entire archive before output when a hard security control fails.
- Store abstract mechanisms and evidence references, never source code or
  distinctive source compositions.
- Count one strongest observation per independence group.
- Preserve experimental patterns for inspiration while preventing their use as
  defaults.
- Require a separate human approval record before `established`.
- Keep new source-manifest fields additive so legacy Phase 3 manifests remain
  schema-valid.
- Keep Design Toolkit entirely outside ingestion, extraction, normalization,
  scoring, classification, and storage.

## Validation

- Focused Design Intelligence and compatibility tests: 15 passed
- Full repository suite: 77 passed
- Integrated Design Intelligence validation: pass
- Schema issues: zero
- Raw archive Git-ignore check: pass
- Production manifests, observations, and patterns: zero

## Checks not run

- Ingestion of a real owner-supplied archive
- Calibration against a reviewed multi-industry corpus
- Browser-rendered or runtime pattern analysis
- Human approval of an established production pattern
- Accessibility or performance measurement adapters

## Remaining work

Phase 6 must implement the recommendation-only Research & Skill Learning
Framework. It must not mutate skills or `.system`.
