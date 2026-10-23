# ADR-012: Plugin Factory Preview Labeling

**Audience:** `common` — see [ADR index](../index.md).

**Status**: Accepted
**Date**: 2026-07-01
**Deciders**: Portal team
**Scope**: Backstage plugins created using the Portal Plugin Factory framework — Preview UI labeling on factory Backstage plugin surfaces.

## Context

Factory Backstage plugins are often experimental or pre-GA. Users need a clear signal that a capability is not yet product-supported without hiding the feature behind a config toggle.

This ADR defines **UI labeling only** — no new config key. Preview labeling is distinct from the `ansible.<pluginId>.enabled` toggle in ADR-011 (which controls whether the portal capability's runtime surfaces are active).

## Alternatives Considered

| Alternative                        | Why rejected                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| Config key `preview: true`         | Adds config surface; preview is a product lifecycle state, not runtime behavior |
| Hide experimental plugins entirely | Blocks UX validation and field feedback                                         |
| Banner on every page               | Too noisy; chip on primary surfaces is sufficient                               |

## Decision

**All factory Backstage plugins that are not yet product-supported display a Preview chip on primary surfaces** (tab labels, capability-local settings headers, fleet views where applicable).

### Rules

1. **Preview chip is UI labeling only** — not a feature toggle. It communicates experimental / not production-supported.
2. **Placement:** Primary surfaces where users discover the capability (e.g. entity tab label, capability-local settings header, fleet summary tab). See **ADR-017** for binding placement rules.
3. **Remove chip** when the plugin graduates to supported product (separate productization ADR or ticket).
4. **Config-gated zero footprint (ADR-010/011) still applies** — Preview does not bypass `enabled: false` behavior.

### Verification

| Test                                | Expected                                                        |
| ----------------------------------- | --------------------------------------------------------------- |
| Factory Backstage plugin not yet GA | Preview chip visible on documented primary surfaces             |
| Plugin graduates to GA              | Preview chip removed in same release as productization decision |
| `ansible.<pluginId>.enabled: false` | No chip, no routes, no tabs (ADR-010 zero footprint)            |

## Related

- Portal Plugin Factory framework
- ADR-010 (plugin composability)
- ADR-011 (config namespace)
- ADR-013 (preview plugin enablement defaults)
- ADR-017 (Preview chip placement)
- ADR-018 (shared UI primitives — Preview chip family)

## Sources

- Portal Plugin Factory Propose phase UX review expectations
