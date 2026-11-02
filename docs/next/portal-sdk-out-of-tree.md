---
render_macros: false
---

# Portal SDK — Out-of-tree plugin readiness

> **Status: not yet available.** This page records what a plugin that lives in
> another repository needs and what the Portal does not provide yet. It is not an
> implementation guide. The governing decision is
> [ADR-028](../adrs/third-party/028-out-of-tree-plugin-obligations.md); check its
> status before relying on anything here. Per ADR-028, fail closed rather than
> inventing a distribution path.

## Audience

Teams that own a Portal plugin whose source lives outside this repository. APME
is the first intended consumer. In-repository contributors should use the
[third-party plugin author guide](portal-sdk-plugin-author-guide.md) instead;
this page covers only the extra work an external repository needs.

## What works today

A plugin that is already built and installed as an RHDH dynamic plugin can use
the declarative contract. Each item below is exercised in this repository, with
APME as the reference contributor:

- **Static NFS declarations.** The `./alpha` entry exports a
  `createFrontendPlugin` with Blueprint declarations for entity tabs, overview
  cards, entity and catalog actions, catalog tabs, catalog table columns,
  catalog header actions, scaffolder workflows and fields, and profile menu
  items.
- **A serialisable manifest.** `PluginManifest` declares capabilities, entry
  points, entitlements, operations and `minimumHostApiVersion`.
- **Host validation and filtering.** The host checks API-version compatibility,
  known experiences, ownership, attachment region, content scope and duplicate
  IDs, then filters by configuration, permission, entitlement and predicate.
  Invalid descriptors are logged and omitted; a missing plugin produces no
  descriptors and does not break the surrounding page.
- **Backend services.** Operation handlers, health and audit use the
  `@ansible/portal-plugin-node` services injected by the host.
- **Dynamic plugin installation.** A prebuilt artifact installs into the
  recorded RHDH `next-2.1` baseline without importing the plugin into the host
  application.

## What is missing

The gaps below block a plugin from being authored, built, released and
installed entirely outside this repository. None of them has an agreed external
contract yet.

| Requirement                                                                                                                                               | Current state                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Published SDK packages (`@ansible/portal-extension-common`, `@ansible/portal-extension-api`, `@ansible/portal-plugin-sdk`, `@ansible/portal-plugin-node`) | Specified in ADR-028, not shipped. In-repository authors use `workspace:^`.                                                                                                         |
| Externals and singleton rules for an external build                                                                                                       | ADR-028 requires `@ansible/portal-extension-api` as a frontend `peerDependency`, never embedded. No build configuration is published for a repository outside this one.             |
| Machine-readable manifest contract                                                                                                                        | No JSON Schema and no validator CLI. `validateManifest` checks only API version, known experience and minimum host version; descriptor rules live in host source.                   |
| Dynamic plugin export                                                                                                                                     | In-repository `export-dynamic` scripts and `frontend/backstage/scripts/build-rhdh.mjs` exist. No documented invocation, embed rule set or NFS asset list for external repositories. |
| Install contract                                                                                                                                          | No official `dynamic-plugins.yaml` entry or enablement recipe. ADR-028 rule 7 says not to invent one.                                                                               |
| External development harness                                                                                                                              | None. Onboarding currently starts by cloning this repository and adding the plugin to the root workspace, which an external author cannot do.                                       |
| Conformance tests                                                                                                                                         | No fixture host or contract test package for descriptor validation, filtering and rendering.                                                                                        |
| Compatibility and deprecation policy                                                                                                                      | Contract is `0.1.0`; pre-1.0 minor versions may break and the policy still requires agreement. No supported matrix or deprecation window.                                           |
| Configuration schema delivery                                                                                                                             | `config.d.ts`, the `ansible.<plugin>.*` namespace and `enabledByConfig` are documented as concepts, not as a mechanism an external package can ship.                                |
| Streaming transports                                                                                                                                      | Operations are documented. SSE, WebSocket and upload relays are not, including their authorization requirements.                                                                    |
| Settings surface                                                                                                                                          | The `settings-section` entry-point kind exists in the manifest type, but native composition has no Blueprint for it. `SettingsShell` reads the legacy registry.                     |
| Navigation surface                                                                                                                                        | Only `AppProfileMenuItemBlueprint` exists for menu contributions. Sidebar and top-level destinations are configuration-driven host policy.                                          |
| Runtime contribution activation                                                                                                                           | `DynamicExtensionDiscovery` validates and logs registry manifests only. Slot-based activation is deferred to Phase 6; static composition is the working path.                       |
| Scaffolder field-registry merge                                                                                                                           | Named as ADR-028 follow-on work; not implemented.                                                                                                                                   |

## What to do today

- **Fail closed.** Do not copy `workspace:^`, embed the contribution registry,
  patch host UI, or publish an unofficial container build, pipeline or
  `dynamic-plugins.yaml` snippet as if it were the supported path. ADR-028
  rules 1, 3, 4 and 7 apply.
- **Ask for contract changes only when needed.** A new Experience, Blueprint
  family, semantic region or host `apiVersion` requires Portal engineering.
  Placement inside an existing Experience is host policy (ADR-028 rule 6).
- **Record the gap.** Open an issue for the specific blocker and link it here so
  the next team does not re-derive it.

## Related

- [ADR-028: Out-of-Tree Plugin Obligations](../adrs/third-party/028-out-of-tree-plugin-obligations.md)
- [Third-party plugin author guide](portal-sdk-plugin-author-guide.md)
- [Native NFS composition](portal-sdk-nfs-composition.md)
- [SDK architecture](portal-sdk-architecture.md)
