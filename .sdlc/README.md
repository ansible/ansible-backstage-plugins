# SDLC Documentation

Software development lifecycle artifacts for the Automation Portal plugins.

```
.sdlc/
├── specs/      Feature specifications (one directory per feature)
├── adrs/       Architecture Decision Records (numbered, append-only)
└── research/   Research and investigation reports
```

## Conventions

- **Specs** are numbered sequentially (`001-`, `002-`, …), one directory per feature
- **ADRs** are numbered sequentially and append-only — superseded, never deleted
- **Research** docs are organised by topic, using descriptive filenames or subdirectories

Developer-facing guides live under `docs/` at the repo root; `.sdlc/` holds planning and
decision artifacts that explain _why_ the code looks the way it does.
