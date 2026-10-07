# ADR-019: Factory Backstage Plugin Capability Delivery Lifecycle

**Audience:** `common` — see [ADR index](../index.md).

**Status**: Accepted
**Date**: 2026-07-23
**Deciders**: Portal team
**Scope**: Portal capabilities delivered by factory Backstage plugins — how artifacts and config progress from early access (EAP) through Tech Preview to GA.

## Context

Factory Backstage plugins deliver **portal capabilities** — cohesive user-facing features that may span multiple plugin artifacts (frontend, `*-common`, optional backend module). ADR-011 defines the runtime config namespace (`ansible.<pluginId>.*`); ADR-013 defines default-off enablement at the dynamic-plugin load and runtime config layers for Preview and GA graduation.

Neither ADR defines **where capability artifacts live** in the product at each lifecycle stage:

- **EAP (early access)** — manual install and additional operator configuration, outside the base portal bundle.
- **Tech Preview** — artifacts bundled in the product release but disabled by default until the operator opts in.
- **GA** — same bundled artifacts; defaults change only after an explicit productization decision.

Contributing teams and operators need one binding model for code placement, enablement, and UI signaling across these stages.

## Alternatives Considered

| Alternative                                           | Why rejected                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Ship experimental capabilities in base bundle enabled | Violates opt-in principle; ADR-013 default-off policy; support risk for pre-GA code     |
| EAP and Tech Preview use the same delivery path       | EAP customers need additive install without upgrading the whole portal chart            |
| GA on merge without productization record             | Silent default flips break existing operators; ADR-013 forbids this                     |
| Separate feature-flag product per capability          | ADR-011 already provides `ansible.<pluginId>.enabled`; a third mechanism adds confusion |

## Decision

**Portal capabilities delivered by factory Backstage plugins progress through three delivery stages. EAP is additive and manual. Tech Preview bundles artifacts in the release but keeps the capability disabled by default. GA changes defaults only through an explicit productization decision.**

### Delivery stages

| Stage            | Code / bundle placement                                                                                                                              | Operator enablement                                                                                                                                                                                                              | UI signal                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **EAP**          | Capability **not** in base portal `dynamic-plugins` defaults or reference Helm values. Delivered via welcome pack, OCI tarball, or operator overlay. | Operator adds plugin to `dynamic-plugins.yaml` (or equivalent) **and** sets `ansible.<pluginId>.enabled: true` plus any capability keys (ADR-011).                                                                               | No product Preview chip requirement (pre-productization) |
| **Tech Preview** | Capability artifacts **included in product release** (chart/bundle) but treated as experimental.                                                     | **Disabled by default** at both layers per ADR-013: absent or `disabled: true` in dynamic-plugins defaults **and** `ansible.<pluginId>.enabled` absent/false. Operator opt-in.                                                   | Preview chip on primary surfaces (ADR-012, ADR-017)      |
| **GA**           | Same bundled artifacts; no separate manual install path required for new deployments.                                                                | **Explicit productization decision** changes defaults (ADR-013 GA graduation): reference config may ship `enabled: true` and dynamic load enabled-by-default for greenfield installs — never silent flip for existing operators. | Preview chip removed in same release as GA decision      |

### Rules

1. **EAP is additive, not base** — factory capability code must not ship enabled in the default portal plugin bundle during EAP. Delivery is manual install plus documented additional configuration.
2. **Tech Preview is bundled but gated** — artifacts are in the release; the capability remains behind `ansible.<pluginId>.enabled` (ADR-011) and the dynamic-plugin load layer (ADR-013) until the operator opts in.
3. **GA is a deliberate default change** — not automatic on merge. Requires a productization record (ADR-013 rule 3) and release notes.
4. **One capability, one toggle** — `pluginId` names the portal capability (ADR-011). EAP, Tech Preview, and GA change **how artifacts are delivered and what defaults ship**, not how many toggles exist.
5. **Out of scope** — portal Day 2 admin (ADR-003); software templates (ADR-016); CI/OCI build mechanics; welcome pack document structure.

### Verification

| Stage        | Test                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| EAP          | Fresh portal install without EAP overlay → capability absent; with manual install + `enabled: true` → capability active    |
| Tech Preview | Fresh install from release bundle → capability artifacts present but inactive until operator enables both layers (ADR-013) |
| GA           | New-install reference config documents new defaults; upgrade release notes cover migration                                 |

## Related

- Portal Plugin Factory framework
- ADR-003 (portal Day 2 admin — out of scope)
- ADR-010 (zero footprint when disabled)
- ADR-011 (`ansible.<pluginId>.*` namespace)
- ADR-012 (Preview labeling — Tech Preview stage)
- ADR-013 (default-off layers and GA graduation)
- ADR-016 (software template vs factory Backstage plugin)
- ADR-017 (Preview chip placement)

## Sources

- Portal Plugin Factory getting-started guide — EAP / Tech Preview / GA delivery table
- ADR-013 (enablement defaults — referenced, not duplicated)
