# ADR-028: Out-of-Tree Plugin Obligations

**Audience:** `third-party` — see [ADR index](../index.md).

**Status:** Proposed
**Date:** 2026-10-07
**Deciders:** Portal team
**Scope:** BU-approved third-party Automation Portal plugins whose source lives **outside** this repository.

## Context

[ADR-010](../common/010-plugin-factory-composability.md) through [ADR-019](../common/019-plugin-factory-delivery-lifecycle.md) bind factory plugins. Several of those ADRs still describe in-tree paths (`plugins/backstage-<pluginId>`, `packages/app`). Third-party plugins are not authored here. They consume a published SDK and load as RHDH dynamic plugins.

Without an explicit out-of-tree ADR, authors copy `workspace:^`, embed `portal-extension-api`, or patch host UI.

## Decision

**Common ADRs still apply.** This ADR adds obligations that exist only because the plugin is out of tree.

1. **Other repository.** Do not add a third-party plugin workspace to this monorepo. Consume published `@ansible/portal-*` package versions, not `workspace:^`.
2. **Author vs host packages.** Depend on `portal-extension-common`, `portal-extension-api`, `portal-plugin-sdk`, and `portal-plugin-node` as appropriate. Do **not** depend on `portal-extension-host`, `portal-core`, or `portal-health-backend`.
3. **Module Federation singleton.** Declare `portal-extension-api` (and other host-shared SDK packages) as `peerDependency`. Never `--embed-package` the registry. Two copies of the contribution registry means contributions never appear. `portal-core` must load first in the host.
4. **Do not patch the host.** Do not add widgets to a hardcoded create-wizard field list, edit installer plugin lists, or open a Portal PR to wire a one-off route. Register `scaffolderFieldExtensions` and capabilities against the published contract.
5. **No `packages/app` composition.** Out-of-tree plugins cannot be statically imported by the upstream app. Dynamic plugin load is the path.
6. **Escalate only for host contract changes.** A new Experience, Blueprint family, semantic region, or host `apiVersion` needs Portal engineering. Placement inside an existing Experience is host policy.
7. **Packaging and reusable CI are unspecified.** Do not invent a Containerfile, Konflux pipeline, or `dynamic-plugins.yaml` snippet as if it were the official publish path. Fail closed and record the gap.

## Consequences

- Third-party onboarding can run without cloning private SDLC trees.
- In-tree factory plugins keep using workspace protocol and `packages/app` guards; that is a **host** concern, not a third-party template.
- Follow-on work: published npm versions of the SDK, generic scaffolder field-registry merge, and a documented export pipeline.

## Related

- [ADR-010](../common/010-plugin-factory-composability.md) — composability (rules apply; location sentences do not)
- [ADR-011](../common/011-plugin-factory-config-namespace.md) — `ansible.<pluginId>.*`
- [ADR-016](../common/016-plugin-factory-template-vs-plugin.md) — template vs plugin
- [Third-party plugin development guide](../../3rd-party-plugins/plugin-development-guide.md)
