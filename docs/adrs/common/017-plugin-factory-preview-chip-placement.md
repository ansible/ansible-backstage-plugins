# ADR-017: Preview Chip Placement

**Audience:** `common` — see [ADR index](../index.md).

**Status**: Accepted
**Date**: 2026-07-23
**Deciders**: Portal team
**Scope**: Backstage plugins created using the Portal Plugin Factory framework — Preview chip placement on factory Backstage plugin UI.

## Context

ADR-012 requires Preview labeling for pre-GA factory Backstage plugins. Without placement rules, teams may scatter chips on every control (table cells, toasts, dialogs) or use full-page banners — both add noise and dilute the signal.

Place the Preview chip on a primary entry point — for example a fleet summary tab header or capability-local settings page header — where users discover the capability.

## Alternatives Considered

| Alternative              | Why rejected                                                |
| ------------------------ | ----------------------------------------------------------- |
| Chip on every control    | Visual noise; users cannot distinguish primary vs secondary |
| Full-page banner default | Too intrusive; ADR-012 already rejects banner-on-every-page |
| No placement guidance    | Inconsistent UX across factory Backstage plugins            |

## Decision

**Preview chips appear on primary entry points only — tab labels and section headers. Not on every nested control.**

### Placement rules

1. **Do place** — tab labels, section headers, capability-local settings page headers (e.g. fleet summary tab, capability settings header).
2. **Do not place** — table cells, row badges, toasts, dialogs, nested form fields, or portal Day 2 admin field labels (ADR-003).
3. **One chip per primary entry point** — avoid duplicate Preview labels on the same surface hierarchy.
4. **ADR-012 lifecycle still applies** — chip is UI labeling only; remove on GA graduation.
5. **ADR-010/011 still apply** — no chip when `ansible.<pluginId>.enabled: false` or plugin not loaded.

### Verification

| Test                    | Expected                                     |
| ----------------------- | -------------------------------------------- |
| Preview plugin, enabled | Chip on documented primary entry points only |
| Plugin disabled         | No chip (ADR-010 zero footprint)             |
| GA graduation           | Chip removed per ADR-012                     |

## Related

- Portal Plugin Factory framework
- ADR-012 (Preview chip labeling — lifecycle)
- ADR-013 (enablement defaults)
- ADR-018 (shared UI primitives — Preview chip family)

## Sources

- ADR-012 alternatives — rejects banner-on-every-page
