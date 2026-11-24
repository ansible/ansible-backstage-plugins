# ADR-018: Factory Shared UI Primitives

**Audience:** `common` — see [ADR index](../index.md).

**Status**: Accepted
**Date**: 2026-07-23
**Deciders**: Portal team
**Scope**: Backstage plugins created using the Portal Plugin Factory framework — React UI contributed by factory Backstage plugins.

## Context

Factory Backstage plugins introduce recurring UI patterns in their frontend code: Preview chips, severity/status signals, catalog status cells, empty states, operation banners. Early prototypes implemented these inside the guest plugin and wired some surfaces statically in `packages/app` — workable for a prototype, but a poor pattern for multiple factory Backstage plugins.

This ADR records **policy intent** for factory Backstage plugin UI: reuse existing host elements and shared structure; avoid static UI duplication in `packages/app`. **Code extraction into a shared library is deferred** — no engineering change in this ADR.

## Alternatives Considered

| Alternative                         | Why rejected                                                             |
| ----------------------------------- | ------------------------------------------------------------------------ |
| Copy components per plugin          | Forked JSX/tokens; inconsistent UX; static duplication                   |
| Hardcode guest UI in `packages/app` | Bypasses extension slots; breaks ADR-010 composability                   |
| Immediate shared UI library extract | Valid goal but out of scope for ADR-only delivery; engineering follow-up |

## Decision

**Prefer reuse over new one-off UI. Use the same reusable UI structure when adding something new. Avoid static UI code where possible.**

### Rules

1. **Reuse existing portal / host elements first** — if self-service, catalog, or another factory Backstage plugin already exposes an extension slot, chip, empty state, or banner pattern, consume it (or the same extension API in `*-common`) instead of inventing a parallel control.
2. **Same reusable UI structure for new patterns** — recurring UI in the guest plugin follows shared primitive shapes (Preview chip family, severity/status chips, catalog status cell, empty/unavailable, operation banners), not a one-off layout unique to one plugin.
3. **No static UI in `packages/app` where possible** — do not hardcode guest plugin components in `EntityPage.tsx`, sidebar items, or other app composition roots. Register UI through host extension slots (`gitRepositoriesExtensionsApiRef`, entity tab APIs, etc.) per ADR-010 and ADR-015. Static composition is an exception only when no slot exists yet — and that gap should drive a shared primitive or new extension API, not a permanent app fork.
4. **Design system** — state the design-system choice explicitly in any future shared UI extract.

### Primitive vocabulary (policy shapes, not a code catalog)

| Primitive             | Intended shared use                 |
| --------------------- | ----------------------------------- |
| Preview chip family   | Pre-GA plugins (ADR-012, ADR-017)   |
| Severity / status     | Shared status/severity language     |
| Catalog status cell   | Catalog column / row signal         |
| Empty / unavailable   | Gateway-down / not-ready states     |
| Extension-injected UI | Prefer slots over static app wiring |

### Deferred work (explicit non-goals for this ADR)

- Do not refactor `ansible-backstage-plugins` as part of this ADR.
- Do not create a new shared UI library or change the submodule pointer.
- Follow-up engineering owns extract and consumer migration.

### Verification

| Test                              | Expected                                                 |
| --------------------------------- | -------------------------------------------------------- |
| Portal Plugin Factory Review      | UI plan cites reuse, extension slots, or primitive shape |
| New plugin with static app import | Flagged as ADR-018 violation unless justified gap        |

## Related

- Portal Plugin Factory framework
- ADR-010 (composability — extension APIs)
- ADR-012 (Preview labeling)
- ADR-015 (catalog-first surfaces)
- ADR-017 (Preview chip placement)

## Sources

- `gitRepositoriesExtensionsApiRef` — extension-injected UI pattern
