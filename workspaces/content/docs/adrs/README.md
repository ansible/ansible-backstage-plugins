# Architecture Decision Records (ADRs)

Architecture Decision Records for the automation content management plugins. ADRs capture
significant architectural decisions with their context, the alternatives considered, and
the consequences.

## Purpose

ADRs are **guardrails for implementation**. Before adding a backend, a content type, or a
new surface, read the relevant ADR to understand what has already been decided, what was
rejected and why, and which constraints apply.

Each decision here is falsifiable and most have already been tested against a live
registry. Where a decision was _validated_ by something that broke, the ADR says so —
that evidence is the reason the decision holds.

## Index

<!-- Add new ADRs here. Format: | NNN | Title | Status | Date | -->

| ADR                                               | Title                                          | Status   | Date       |
| ------------------------------------------------- | ---------------------------------------------- | -------- | ---------- |
| [001](001-two-axis-adapter-model.md)              | Two-Axis Adapter Model                         | Accepted | 2026-09-14 |
| [002](002-build-time-content-manifest.md)         | Build-Time Content Manifest                    | Accepted | 2026-09-14 |
| [003](003-probe-registry-capabilities.md)         | Probe Registry Capabilities, Never Assume Them | Accepted | 2026-09-14 |
| [004](004-digest-keyed-state.md)                  | Digest-Keyed State                             | Accepted | 2026-09-14 |
| [005](005-dedicated-repository-and-mount-path.md) | Dedicated Repository and Config-Mounted Route  | Accepted | 2026-09-14 |
| [006](006-tls-verification-by-default.md)         | TLS Verification by Default                    | Accepted | 2026-10-16 |

## Numbering Convention

ADRs are numbered sequentially: `001-title.md`, `002-title.md`, and so on.

- Numbers are global to this repository
- Never reuse a number, even when an ADR is superseded
- Use kebab-case for the title portion of the filename

## Statuses

| Status     | Meaning                                       |
| ---------- | --------------------------------------------- |
| Proposed   | Under discussion, not yet accepted            |
| Accepted   | Decision is active and should be followed     |
| Superseded | Replaced by a newer ADR (link to replacement) |
