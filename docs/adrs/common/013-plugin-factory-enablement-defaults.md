# ADR-013: Preview Plugin Enablement Defaults

**Audience:** `common` — see [ADR index](../index.md).

**Status**: Accepted
**Date**: 2026-07-01
**Deciders**: Portal team
**Scope**: Backstage plugins created using the Portal Plugin Factory framework — RHDH dynamic-plugin load and runtime `enabled` defaults.

## Context

Factory Backstage plugin **capabilities** often ship in Preview before GA. Operators need predictable defaults: experimental capabilities must not appear or load unless explicitly enabled. ADR-011 defines runtime `ansible.<pluginId>.enabled` defaulting to `false` when absent — one toggle per portal capability, regardless of how many plugin artifacts implement it. ADR-012 defines Preview UI labeling. ADR-019 defines delivery placement (EAP vs bundled Tech Preview). This ADR covers **RHDH dynamic plugin load** (`dynamic-plugins.yaml` / OCI tarball) and the **GA graduation** process for changing enablement defaults.

Without a two-layer enablement policy, a Preview capability could be loaded by RHDH's dynamic plugin bundle while runtime config says disabled — or conversely, runtime config could enable a capability whose artifacts were never deployed. Teams need a documented path from Preview (opt-in) to GA (enabled-by-default only when explicitly approved).

## Alternatives Considered

| Alternative                                     | Why rejected                                                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Preview chip auto-enables plugin                | Conflicts with ADR-012 (UI labeling only); operators cannot safely trial UI without loading backend routes |
| Single `enabled` toggle only                    | Does not cover RHDH dynamic plugin load (`disabled` in `dynamic-plugins.yaml`)                             |
| Enable all factory Backstage plugins by default | Violates opt-in principle; overwhelms operators and support for experimental capabilities                  |
| Per-plugin ad-hoc defaults                      | No factory acceptance criteria; inconsistent operator experience                                           |

## Decision

**Preview and pre-GA portal capabilities delivered by factory Backstage plugins are disabled by default at both the dynamic-plugin load layer and the runtime config layer. GA graduation to enabled-by-default requires an explicit productization decision, documented case-by-case.**

### Two-layer enablement

| Layer                      | Preview / pre-GA default                                                                                                | GA graduation                                                                                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dynamic plugin load**    | Plugin absent from portal `dynamic-plugins.yaml`, or listed with `disabled: true`, until operator explicitly enables it | Productization ticket documents when plugin moves to enabled-by-default in `dynamic-plugins.default.yaml`, operator bundle, or reference Helm values — only after factory Review approval |
| **Runtime feature toggle** | `ansible.<pluginId>.enabled` absent → `false` (ADR-011)                                                                 | Reference `app-config.yaml` may ship `enabled: true` only after GA approval; never silent flip for existing deployments                                                                   |

Both layers must pass for a capability to be fully active. Preview chip (ADR-012) appears only when the capability's artifacts are loaded **and** runtime `enabled` is true.

### Factory process rules

1. **Propose phase** — document enablement requirements (secrets, gateway URL, catalog sync, dynamic plugin package) and rationale for default-off.
2. **Preview phase** — Preview chip on primary surfaces; plugin remains opt-in at both layers.
3. **GA graduation** — requires explicit productization ADR, program ticket, or Portal Plugin Factory Review record. Document which default changes (dynamic load, runtime config, or both) and migration notes for existing operators.
4. **No silent default flip** — upgrading portal must not enable Preview plugins that were previously disabled unless the release notes and config migration explicitly call out the change.

### Verification

| Test                                               | Expected                                          |
| -------------------------------------------------- | ------------------------------------------------- |
| Plugin absent from `dynamic-plugins.yaml`          | Plugin not loaded; no routes or backend modules   |
| `disabled: true` in `dynamic-plugins.yaml`         | Plugin not loaded                                 |
| Plugin loaded, `ansible.<pluginId>.enabled: false` | ADR-010 zero footprint; no Preview chip           |
| Plugin loaded, `enabled: true`, Preview lifecycle  | Preview chip visible (ADR-012)                    |
| GA graduation documented                           | Release notes + config reference show new default |

## Related

- Portal Plugin Factory framework
- ADR-010 (plugin composability — zero footprint)
- ADR-011 (config namespace — runtime `enabled`)
- ADR-012 (Preview chip labeling)
- ADR-019 (delivery lifecycle — EAP vs bundled Tech Preview)

## Sources

- [RHDH dynamic plugins — installing plugins](https://github.com/redhat-developer/rhdh/blob/main/docs/dynamic-plugins/installing-plugins.md)
- Plugin Factory Propose / Review phase acceptance criteria
