# Design Intelligence implementation

## Boundary

Design Intelligence ingests approved untrusted website archives, extracts
abstract observations, records evidence, normalizes patterns, calculates
confidence and recommendation scores, classifies patterns, stores provenance,
and answers structured queries.

Design Toolkit remains responsible for project-specific design reasoning. It may
consume validated knowledge records but cannot ingest sources, change evidence,
calculate scores, or promote classifications.

## Pipeline

```text
approved ZIP
  -> fail-closed archive scan
  -> local Git-ignored raw capture
  -> tracked provenance manifest
  -> static signal extraction
  -> JSONL observation evidence
  -> independence-group deduplication
  -> confidence and recommendation scoring
  -> human-gated classification
  -> domain YAML knowledge
  -> structured query
```

## Secure ingestion

`design_ingestion.py` accepts ZIP archives only. It rejects traversal, drive
paths, null bytes, symlinks, encrypted entries, excessive path depth, file-count
and size breaches, suspicious compression ratios, disallowed file types,
sensitive filenames, and detected secret patterns before committing output.

Archive JavaScript, build files, content instructions, and assets are never
executed. Embedded instruction indicators are recorded as untrusted data.
Potential personal-data indicators make redaction review explicit.

Raw captures live under
`design-intelligence/references/raw/<source-id>/<capture-id>/` and are excluded
from Git. Tracked manifests store hashes, inventory, permitted use, independence,
quality, scan evidence, and ingestion provenance.

## Extraction and observations

The initial extractor uses deterministic static signals. It records no source
snippets or implementation code. Observations describe the problem, mechanism,
context, quality implications, weights, evidence file references, extractor
version, manifest, and archive hash.

Observations use JSONL as an internal evidence log. They are not the public
knowledge architecture.

## Scoring and classification

One strongest observation per independence group contributes to scoring.
Observation weight is:

```text
source quality
* extraction confidence
* independence weight
* freshness
* contextual relevance
```

Evidence confidence uses a one-sided Wilson lower bound over weighted
independent evidence. Recommendation score combines confidence, accessibility,
performance, usability, outcome evidence, and contradiction penalties.

Classification keeps a candidate and final tier. An `established` candidate is
downgraded to `contextual` until a schema-valid human approval names the pattern
and reviewer. Singular ideas remain `experimental` and searchable.

## Storage and querying

Canonical records are written to
`design-intelligence/knowledge/<domain>/<pattern-id>.yaml`. They contain abstract
guidance, quality considerations, contraindications, failure modes, provenance,
scores, classification, dates, and reviewers.

Queries filter by domain, industry, UX goal, accessibility, performance,
confidence level, evidence confidence, recommendation score, and text.

## CLI

```powershell
python -m skill_ecosystem.intelligence_cli --root . ingest ...
python -m skill_ecosystem.intelligence_cli --root . extract ...
python -m skill_ecosystem.intelligence_cli --root . normalize
python -m skill_ecosystem.intelligence_cli --root . query ...
python -m skill_ecosystem.intelligence_cli --root . validate
```

The packaged console command is `design-intelligence`.

## Extension points

- archive readers with equivalent fail-closed controls;
- static framework and component analyzers;
- accessibility and performance measurement adapters;
- supervised observation review;
- calibrated scoring models;
- additional knowledge domains;
- industry overlays referencing canonical patterns;
- provenance stores and query indexes.
