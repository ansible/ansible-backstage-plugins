# ADR-015: Catalog-First Placement and Host Surface Slots

**Audience:** `common` — see [ADR index](../index.md).

**Status**: Accepted
**Date**: 2026-07-23
**Deciders**: Portal team
**Scope**: Backstage plugins created using the Portal Plugin Factory framework — frontend surface placement via host extension APIs.

## Context

Factory Backstage plugins often extend capabilities that are naturally catalog- or entity-scoped (content quality, compliance signals, repository metadata). Adding a standalone sidebar entry or top-level route for every plugin fragments navigation and fights the portal's consolidation model.

Early factory Backstage plugins validated catalog-first placement: no dedicated sidebar route; capability surfaces register through host extension APIs (e.g. `gitRepositoriesExtensionsApiRef` on the Git Repositories host, `@ansible/plugin-backstage-self-service`).

Portal-wide Day 2 admin (Connections, Sync, SCM) is owned by [ADR-003](../host/003-admin-experience-wizard-and-settings.md). This ADR covers **capability-local** settings only (e.g. Git Repos → plugin-specific settings).

## Alternatives Considered

| Alternative                                     | Why rejected                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| Standalone sidebar per factory Backstage plugin | Navigation sprawl; duplicates host surfaces users already visit           |
| Full workflow on catalog list row               | List rows are for glanceable signal + entry, not multi-step work          |
| Global admin page per plugin                    | Splits settings from the capability context; conflicts with ADR-003 scope |

## Decision

**Prefer extending host catalog/entity surfaces over new top-level navigation. Use a standard surface vocabulary for catalog-scoped plugins.**

### Standard host surface slots

When a factory Backstage plugin extends a host surface, map UI to these slots via the host's extension API (e.g. `gitRepositoriesExtensionsApiRef` in `backstage-rhaap-common`). The guest plugin registers React through `apiFactories` on its dynamic-plugin manifest; the host renders slots without importing the guest package (ADR-010).

| Slot                      | Purpose                              | Example                    |
| ------------------------- | ------------------------------------ | -------------------------- |
| Catalog list signal       | Glanceable status + entry            | Status column              |
| Entity overview slot      | Summary card on entity page          | Overview card              |
| Entity tab(s)             | Per-entity triage and detail         | Detail, Dependencies       |
| Host page tab (fleet)     | Cross-entity aggregate view          | Host → fleet summary tab   |
| Capability-local settings | Rules, health, plugin-specific admin | Host → capability settings |
| Header actions / menu     | Quick actions on entity or host page | Scan, Open external tool   |

### Rules

1. **Catalog-first** — extend the host catalog/entity experience before adding standalone nav.
2. **Standalone nav only with justification** — sidebar or top-level route permitted when documented in the prototype plan and approved at Portal Plugin Factory Propose/Review. Must still honor ADR-010 zero footprint.
3. **Light density on list rows** — catalog columns and row signals show status and entry only; do not embed multi-step workflows on the row.
4. **Capability-local settings** — plugin admin UI lives next to the host capability, not on portal Day 2 admin pages (ADR-003).

### Verification

| Test                               | Expected                                             |
| ---------------------------------- | ---------------------------------------------------- |
| Plugin disabled (`enabled: false`) | No host surface contributions (ADR-010)              |
| Portal Plugin Factory Review       | Surface map documents which slots the plugin uses    |
| Standalone nav proposed            | Prototype plan includes justification vs host extend |

## Related

- Portal Plugin Factory framework
- ADR-003 (portal Day 2 admin — out of scope for this ADR)
- ADR-010 (composability — extension APIs, zero footprint)
- ADR-016 (software template vs factory Backstage plugin)
- ADR-018 (shared UI primitives — reuse host slots over static UI)

## Sources

- `gitRepositoriesExtensionsApiRef` extension method map
