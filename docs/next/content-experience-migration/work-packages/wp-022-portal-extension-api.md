# WP-022 — Portal extension API

| Field      | Value                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Phase      | 7 — Portal composition                                                                          |
| Depends on | WP-002 and WP-008                                                                               |
| Target     | `portal-extension-common` and `portal-extension-api`                                            |
| Outcome    | Versioned capability-based contracts for content routes, cards, tabs, actions, fields, and APIs |

## Human summary

**Why this matters:** Portal features need stable, shared contracts so built-in and third-party plugins can add content without directly changing the host application.

**What will change:** Two packages will define versioned extension contracts and frontend bindings for routes, cards, tabs, actions, fields, menus, settings, navigation, and application programming interfaces (APIs). Contributions will declare ownership, compatibility, applicability, ordering, and permission requirements before activation.

**PR scope:** Inventory existing contribution points, implement descriptor validation and lazy registries, compose permissions and feature flags, migrate one execution-environment contribution, and provide an external-plugin example.

**Not in this PR:** It will not implement the full multi-provider host or move backend operation extension points into frontend packages. Static registration remains available as a feature-flagged fallback until dynamic parity is proven.

**Success looks like:** Invalid or incompatible contributions are rejected without stopping the portal, denied features remain inaccessible through both navigation and direct routes, and removing an extension leaves no broken shell. A third-party extension using only published contracts compiles and renders in the sample Red Hat Developer Hub (RHDH) host.

## Scope and changes

Define stable contribution contracts for entity tabs/actions, overview slots/cards, page tabs, table columns, row/header menu items, persistent overlay/dialog hosts, settings sections, routes/pages, operation UI, Scaffolder fields, API refs, navigation, and permission-aware rendering. Every contribution declares stable ID, owner plugin, title/category/order, supported entity kinds/types, a serializable applicability expression where possible, optional permission/resource requirement, React component or operation ID as appropriate, and minimum host API version. `portal-extension-common` owns dependency-light serializable descriptors, applicability, and permission metadata. `portal-extension-api` owns frontend API refs and typed React bindings, including lazy component loaders. Backend operation extension points remain in `content-primitives-node`. Descriptor compatibility and uniqueness are validated before activation.

```ts
interface ContentCardDescriptor {
  id: string;
  ownerPlugin: string;
  contractVersion: string;
  title: string;
  category: string;
  order: number;
  supportedEntityKinds?: string[];
  appliesTo: ContentPredicate;
  requiredPermission?: { name: string; resource?: ResourceRequirement };
  minimumHostApiVersion: string;
}

interface ContentCardBinding {
  descriptor: ContentCardDescriptor;
  loader: () => Promise<{ component: React.ComponentType<ContentCardProps> }>;
}
```

## Implementation slices

1. Inventory current entity/page tabs, actions, slots/cards, table columns, row/header menus, overlays/dialog hosts, settings sections, routes, fields, and API refs.
2. Freeze contribution kinds and all required descriptor fields, IDs, versions, applicability, resource/permission semantics, ordering, collision, and failure-isolation rules.
3. Implement `portal-extension-common` descriptor validation and `portal-extension-api` registries/lazy frontend resolvers without crossing runtime boundaries.
4. Add permission and feature-flag composition.
5. Migrate one EE contribution and publish an external-plugin example.

## Ordered PR series

1. **Serializable contracts:** publish `portal-extension-common` descriptors, versioning, applicability, permission metadata, and validation; no host composition changes.
2. **Frontend bindings:** publish `portal-extension-api` API refs, typed lazy bindings, registries, and package/runtime dependency guards.
3. **Authorization composition:** add resource-aware permission and feature-flag behavior plus direct-route denial fixtures while static registration remains active.
4. **Conformance examples:** migrate one WP-008 EE contribution behind a flag and publish the external-plugin/RHDH example using only released contracts.

Each PR must be independently releasable, preserve static registration as rollback, and avoid requiring the WP-023 production host before contract publication.

## Required tests

- Duplicate IDs, unsupported versions, ordering, lazy-load failure, removal, and empty registry.
- Schema/registry coverage for every contribution kind and rejection of missing owner/category/order/resource/minimum-host metadata where required.
- Applicability and permission checks cannot be bypassed through direct route access.
- Package/runtime dependency guards.
- Dynamic install/remove/upgrade in supported RHDH.
- Accessibility and loading/error/empty-state behavior for host slots.

### Acceptance criteria

- Given an incompatible descriptor, registration fails locally without preventing portal startup.
- Given a denied permission, navigation, route, and component content are all inaccessible.
- Given an extension is removed, no empty or broken shell remains.
- Given a third-party extension uses only published contracts, it compiles and renders in the sample host.

## Rollback and completion

Keep static registration as a feature-flagged fallback until dynamic parity gates pass. Done means one built-in and one sample external contribution work without direct host modification.
