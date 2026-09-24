# Framework CLIs

Use Python 3.11 or newer with the package installed from the repository:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[test]"
```

## Design Intelligence

Ingest an approved ZIP without executing its content:

```powershell
design-intelligence --root . ingest `
  --archive C:\approved\capture.zip `
  --source-id example-saas `
  --capture-id 2026-07-30 `
  --source "Owner-supplied Example SaaS archive" `
  --captured-at "2026-07-30T12:00:00Z" `
  --permitted-use "Extract reusable principles; do not reproduce." `
  --independence-group example-saas `
  --ingested-by reviewer-name `
  --source-quality 0.85
```

Extract observations, normalize knowledge, query, and validate:

```powershell
design-intelligence --root . extract `
  --source-id example-saas `
  --capture-id 2026-07-30 `
  --industry saas

design-intelligence --root . normalize
design-intelligence --root . normalize --approval-file approvals\knowledge.yaml

design-intelligence --root . query `
  --domain navigation `
  --industry saas `
  --ux-goal efficient-navigation `
  --accessibility supports `
  --performance neutral `
  --confidence-level established `
  --min-evidence-confidence 0.80 `
  --min-recommendation-score 0.75

design-intelligence --root . validate
```

Normalization never promotes an established candidate without the separate
approval file.

## Skill Learning

Place only reviewed, schema-valid source records under `research/sources/`.

```powershell
skill-learning --root . compare
skill-learning --root . compare --skill security
skill-learning --root . validate
```

Record a human decision:

```powershell
skill-learning --root . decide `
  --recommendation security-example-abc123 `
  --decision approved `
  --reviewer reviewer-name `
  --reason "Approved for a separately scoped implementation."
```

This records approval only. It does not edit or apply a skill change. There is no
apply command.

## Complete integration

```powershell
ecosystem-integrate --root .
ecosystem-integrate --root . --markdown
```

Development equivalents are:

```powershell
python -m skill_ecosystem.intelligence_cli
python -m skill_ecosystem.skill_learning_cli
python -m skill_ecosystem.integration_cli
```
