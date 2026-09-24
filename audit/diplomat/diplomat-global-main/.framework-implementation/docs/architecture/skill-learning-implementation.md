# Research & Skill Learning implementation

## Purpose

Compare exact first-party skill revisions with explicitly approved, versioned,
external evidence and create recommendation-only improvement records. The
framework cannot modify skills, `.system`, manifests, references, scripts, or
registry status.

## Pipeline

```text
human-approved source record
  -> schema and policy validation
  -> untrusted paraphrased claims
  -> upstream deduplication
  -> exact skill revision hash
  -> capability and stale-guidance comparison
  -> gap or conflict
  -> evidence-backed recommendation
  -> separate human decision record
  -> later implementation outside this framework
```

## Approved source records

Records under `research/sources/` contain canonical URL, publisher, source type,
authority, approval scope, version or immutable reference, access/update dates,
content hash, license constraints, freshness, shared-upstream group, and
paraphrased claims.

Claims identify affected skills, capability, expected and obsolete markers,
applicability, suggested change, alternatives, benefits, and trade-offs. The
framework does not store long excerpts and never executes retrieved code.

Only schema-valid records with explicit human approval are loaded. Community
claims require at least two independent upstream groups before they may generate
a recommendation.

## Comparison

Each run hashes all discovered first-party and `.system` skill content before
comparison. It compares approved claims with the exact skill revision, groups
gaps and conflicts by skill and capability, deduplicates evidence by upstream,
and calculates a documented authority/freshness confidence.

After recommendations and the report are written, protected content is hashed
again. Any change aborts the run.

## Recommendation and approval

Recommendations contain:

- affected skill, version, and revision hash;
- problem and versioned evidence;
- proposed change and alternatives;
- benefits and expected impact;
- compatibility, security, maintenance, and context-cost trade-offs;
- confidence and independent upstream count;
- validation plan;
- status `proposed`, pending human decision, and no implementation reference.

Human decisions are immutable, separately stored records scoped to exactly one
recommendation. Approval does not apply the recommendation. There is no apply
command.

## CLI

```powershell
skill-learning --root . compare
skill-learning --root . compare --skill security
skill-learning --root . decide `
  --recommendation <id> `
  --decision approved `
  --reviewer <name> `
  --reason <reason>
skill-learning --root . validate
```

Equivalent development usage is
`python -m skill_ecosystem.skill_learning_cli`.

## Initial source families

The schema supports approved primary evidence from official OpenAI/Codex,
Anthropic/Claude Code, Cursor, Continue.dev, MCP, standards bodies, and public
repository revisions. Sources are not bundled merely because a family is in
scope; each record still requires provenance and human approval.

## Extension points

- approved retrieval adapters that emit source records without executing code;
- source freshness and immutable-reference checks;
- richer capability mapping;
- conflict and deprecation detectors;
- recommendation review queues;
- outcome tracking for separately implemented recommendations;
- scheduled bounded comparisons with rate limits and human ownership.
