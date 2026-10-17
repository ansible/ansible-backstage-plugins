# ADR-016: Software Template vs Factory Backstage Plugin

**Audience:** `common` — see [ADR index](../index.md).

**Status**: Accepted
**Date**: 2026-07-23
**Deciders**: Portal team
**Scope**: Portal Plugin Factory framework — Propose phase delivery choice

## Context

Not every portal capability needs a new factory Backstage plugin. Many user jobs are one-shot create/launch/provision flows better served by Backstage **software templates** — scaffolder `template.yaml` definitions under the self-service plugin (no new `@ansible/plugin-*` artifact, no RHDH dynamic-plugin OCI tarball).

Shipping a factory Backstage plugin when a software template suffices adds packaging (`backstage-<pluginId>`, `*-common`, optional backend module), dual-layer enablement (ADR-013), and Preview → GA lifecycle overhead.

Contributing teams need a binding decision tree at Propose phase so full Portal Plugin Factory onboarding applies only when a factory Backstage plugin is the right delivery vehicle.

### Technical distinction

| Delivery                     | What it is                              | Where it lives                                                                                                        | Typical load path                                                 |
| ---------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Software template**        | Scaffolder form → action → done         | `examples/` or catalog template YAML; runs via `@ansible/plugin-backstage-self-service`                               | No new dynamic plugin; uses existing portal plugins               |
| **Factory Backstage plugin** | Persistent UI + optional backend module | `ansible-backstage-plugins/plugins/backstage-<pluginId>` (+ `*-common`, optional `catalog-backend-module-<pluginId>`) | RHDH dynamic plugin OCI tarball and/or `packages/app` composition |

## Alternatives Considered

| Alternative                            | Why rejected                                                                |
| -------------------------------------- | --------------------------------------------------------------------------- |
| Always ship a factory Backstage plugin | Overbuild for one-shot flows; unnecessary Preview/EAP/GA lifecycle          |
| Always use software templates          | Cannot host ongoing workspaces (tabs, dashboards, settings)                 |
| Ad-hoc decision per team               | Inconsistent Portal Plugin Factory intake; no acceptance criteria alignment |

## Decision

**At Propose phase, choose software template vs factory Backstage plugin using the decision tree below. Full Portal Plugin Factory onboarding for a Backstage plugin applies only when the outcome is factory Backstage plugin.**

### Decision tree

```text
Is the user job mostly one-shot create / launch / provision
(form → run → done)?
  YES → Software template (self-service / scaffolder).
        Skip factory Feature → EAP → Preview → GA *plugin* path
        unless you also need persistent UI or custom scaffolder
        fields / actions (those still need plugin artifacts;
        they do not require an ongoing workspace).
  NO  → Does the user need an ongoing workspace
        (pages, entity/catalog tabs, capability settings, dashboards)?
          YES → Factory Backstage plugin (new plugin or extend host).
          NO  → Can it be a small addition to catalog / self-service?
                  YES → Extend existing Backstage plugin first (ADR-010 / ADR-015).
                  NO  → Revisit scope; do not invent a third path.
```

### Choose a factory Backstage plugin when any apply

- Persistent UI after the first run (entity tabs, fleet views, settings pages)
- Entity or catalog tabs / columns via host extension APIs
- New `ansible.<pluginId>` runtime config namespace for the portal capability (ADR-011)
- Optional backend module (proxy routes, catalog sync scheduler)
- Preview chip + default-off lifecycle (ADR-012, ADR-013, ADR-017, ADR-019)
- Must be independently removable via dynamic-plugin load + `enabled` toggle (ADR-010)

### Pure software templates

Software templates follow self-service contribution norms. They usually skip the full Portal Plugin Factory Feature → EAP → Preview → GA **Backstage plugin** path. Custom scaffolder field widgets still need a frontend plugin artifact, and custom scaffolder actions still need a backend module; that is not the same as an ongoing workspace and does not by itself start the EAP → Preview → GA capability path.

### Out of scope

Portal setup wizard and Day 2 admin settings pages — [ADR-003](../host/003-admin-experience-wizard-and-settings.md).

### Verification

| Test                         | Expected                                                     |
| ---------------------------- | ------------------------------------------------------------ |
| Propose phase deliverable    | Documents template vs Backstage plugin choice with rationale |
| Portal Plugin Factory Review | Confirms plugin path meets criteria above                    |

## Related

- Portal Plugin Factory framework
- ADR-010 (composability — extend existing Backstage plugin first)
- ADR-011 (config namespace — plugin path)
- ADR-013 (dynamic-plugin load + runtime enablement)
- ADR-015 (catalog-first surfaces — plugin path)
- ADR-019 (delivery lifecycle — Feature → EAP → Tech Preview → GA)
- ADR-003 (portal admin — not in scope)

## Sources

- Portal Plugin Factory getting-started guide — "Decide: software template vs factory Backstage plugin"
