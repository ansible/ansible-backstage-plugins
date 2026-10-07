# ADR-010: Plugin Composability and Independence

**Audience:** `common` — see [ADR index](../index.md).

**Status**: Accepted
**Date**: 2026-07-01
**Deciders**: Portal team
**Scope**: Backstage plugins created using the Portal Plugin Factory framework — plugins in `ansible-backstage-plugins` (frontend, `*-common`, optional backend module), loaded as RHDH dynamic plugins or composed in the upstream dev app.

## Context

The portal ships with base RHAAP Backstage plugins (sidebar, catalog, scaffolder, auth). As scope grows through the **Portal Plugin Factory framework**, each additional **portal capability** delivered by factory Backstage plugins must be independently removable. A capability is what operators and users see (for example content-quality signals on Git Repositories); it may be implemented across one or more Backstage plugin artifacts (frontend, `*-common`, optional backend module). This ADR is a binding architectural decision for all teams contributing factory Backstage plugins.

Factory Backstage plugins are not software templates. A capability must be removable without breaking the base portal — a customer who does not load or enable a given capability should never see its UI or encounter errors.

The question is how to enforce this boundary in both the upstream Backstage dev app (static imports) and RHDH dynamic plugin mode.

## Alternatives Considered

| Alternative                                              | Source | Why rejected                                                                              |
| -------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| Cross-plugin `package.json` dependencies                 | —      | Removing an optional plugin breaks a host plugin build; violates independence requirement |
| Feature flags in shared plugin                           | —      | Couples lifecycle; shared plugin must know about every optional feature                   |
| Runtime plugin discovery (Backstage new frontend system) | —      | Not available in Backstage 0.33.1; future migration path                                  |

## Decision

**No cross-plugin dependencies. Shared types in `*-common` packages. Config-gated zero footprint.**

### Rules

1. **No cross-plugin `package.json` deps.** A base or host Backstage plugin (e.g. `@ansible/plugin-self-service`) must not depend on an optional factory Backstage plugin (e.g. `@ansible/plugin-backstage-quality`). If a host plugin needs data from a guest plugin, it imports from that plugin's `*-common` library (shared contracts), not the implementation package.

2. **Shared types and API refs in `*-common`.** Plugin interfaces, API refs, config readers, and catalog helpers live in `*-common`. Host plugins consume contracts via API refs (e.g. `<plugin>ApiRef`), not implementation packages.

3. **Config-gated zero footprint (per capability).** `ansible.<pluginId>.enabled: false` (or block absent) per **ADR-011** turns off the **portal capability** identified by `<pluginId>` — not individual plugin packages in isolation. All surfaces for that capability disappear together: host extension slots, entity tabs, routes, backend proxy registration, and capability-local settings. Verified by toggling config and confirming zero console errors.

4. **RHDH dynamic plugin mode.**
   - **Portal deployment:** `dynamic-plugins.yaml` lists plugin packages with `disabled` and optional `pluginConfig`.
   - **Wiring:** `pluginConfig.dynamicPlugins.frontend.<package>` declares routes, entity tabs, mount points, and icons.
   - **Runtime merge:** the init container produces `app-config.dynamic-plugins.yaml` (generated; do not hand-edit).
   - **Upstream dev app:** `packages/app` is the composition root — it may import multiple plugins; individual plugins must not import each other.

5. **Upstream dev app.** Static imports in `App.tsx`/`Root.tsx`/`EntityPage.tsx` use config guards (`use<Capability>Enabled()` hook) to conditionally render. Optional host-surface contributions register via shared extension APIs in `*-common` and are wired from `packages/app` when the capability is enabled — host plugins do not import guest plugin packages.

6. **Navigation placement is decided per capability during Portal Plugin Factory Propose**, based on use case. Prefer extending existing surfaces when the feature is naturally catalog- or entity-scoped (see **ADR-015**). Standalone sidebar entries or top-level routes are permitted when justified in the prototype plan and approved at Portal Plugin Factory Review. All placements must still honor config-gated zero footprint (rules 1–5).

### Illustrative pattern

A catalog-scoped factory Backstage plugin can register entity tabs and catalog columns through a host extension API (e.g. `gitRepositoriesExtensionsApiRef`) and `*-common` API refs, with composition wired from `packages/app` — without the host plugin depending on the guest implementation package.

### Verification

| Test                                              | Expected                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| `ansible.<pluginId>.enabled: false` + restart     | No capability UI (tabs, columns, settings, routes); no console errors |
| Remove capability plugin artifacts from workspace | Base plugins still build and run without errors                       |
| RHDH with capability artifacts not loaded         | Base portal functions normally                                        |
| Host plugin `package.json`                        | No dependency on optional factory Backstage plugins                   |

## Related

- Portal Plugin Factory framework
- ADR-011 (config namespace — `ansible.<pluginId>.*`)
- ADR-012 (Preview chip labeling)
- ADR-013 (Preview plugin enablement defaults)
- ADR-015 (catalog-first placement and host surface slots)
- ADR-016 (software template vs factory Backstage plugin)
- ADR-018 (shared UI primitives — reuse over static UI)
- ADR-005 (extend existing plugins pattern)

## Sources

- ADR-005 (extend existing plugins pattern)
- [RHDH dynamic plugins — installing plugins](https://github.com/redhat-developer/rhdh/blob/main/docs/dynamic-plugins/installing-plugins.md)
- RHDH plugin loading architecture
