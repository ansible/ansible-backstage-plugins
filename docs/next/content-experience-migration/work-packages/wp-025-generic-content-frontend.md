# WP-025 — Generic content frontend

| Field      | Value                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| Phase      | 7 — Portal composition                                                                                  |
| Depends on | WP-005, WP-011, and WP-022                                                                              |
| Target     | Generic content frontend plugin                                                                         |
| Outcome    | Content list/detail/provenance/primitive/job experiences independent of any one backend or content type |

## Human summary

**Why this matters:** Users need one consistent way to browse and understand content regardless of its type, source, or backend provider.

**What will change:** A generic frontend will provide content lists, filters, immutable links, detail pages, source and digest identity, provenance, evidence, and processor results. It will also provide operation and job components against the published client contracts, using frozen fixtures until the earlier-phase operation runtime is available.

**PR scope:** Build the permission-aware list and detail experience, fixture-backed operation and job components, extension slots, legacy route and browser-state migration, telemetry, accessibility, and representative dynamic-deployment tests. Use a minimal registry fixture so development does not depend on completion of the production multi-provider host.

**Not in this PR:** It will not implement content-type-specific interfaces, define operation or job backend contracts, or require every specialized plugin to be installed. The components connect to live operation and job endpoints only when the earlier-phase WP-012 contracts and runtime are present; later host work connects the same slots to production provider composition.

**Success looks like:** Reloading a copied immutable-content link returns the same digest, while moved mutable references clearly show both the observed reference and resolved digest. The interface works for an execution environment and at least one other content type, preserves backend and Catalog state parity, and remains useful when specialized plugins are absent.

## Scope and changes

Implement list/detail navigation, filters, digest/ref/source identity, primitive summaries, and provenance/evidence using `content-primitives-client`. Add operation-discovery and job-progress components against the published client contracts, but exercise them with frozen fixtures and keep them feature-gated until WP-012's live operation runtime is present. Compose specialized UI through the registry. Preserve approved current `/content` routes through aliases or redirects and implement all semantic/loading/error/denied states.

This WP compiles and tests against a minimal `ContentExtensionRegistryPort` fixture implementing the frozen WP-022 descriptor contract; it does not require the WP-023 host to complete. The package exposes slots and a no-provider fallback through that port. WP-023 later binds the production multi-provider host and reruns the same conformance fixtures without changing generic content behavior.

```tsx
const { value, loading, error } = useAsync(() =>
  client.getContent({ contentKey, digest }, { signal: abortController.signal }),
);
```

## Implementation slices

1. Freeze route/query/deep-link and browser-state behavior.
2. Build permission-aware list/filter/pagination and detail shell.
3. Add provenance and primitive components plus fixture-backed, feature-gated operation and job components.
4. Integrate extension slots and migrate legacy routes/state.
5. Add accessibility, telemetry, and representative dynamic deployment tests.

## Required tests

- Routes, filters, pagination, deep links, history, storage migration, and legacy aliases.
- Known/unknown/not-scanned/partial/failed/stale/denied and loading/error states.
- Direct-route authorization, sensitive evidence redaction, and safe error messages.
- Accessibility, responsive layouts, visual regression, abort on navigation, and large data sets.
- Cross-surface digest/state parity with REST and Catalog.

### Acceptance criteria

- Given a copied immutable-content URL, an authorized user reaches the same digest after reload.
- Given a mutable ref moves, the page makes the observed ref and resolved digest unambiguous.
- Given a denied primitive/evidence permission, neither UI nor direct client access discloses it.
- Given a content-type plugin is absent, generic facts remain usable without broken slots.

## Rollback and completion

Retain legacy frontend behind a route/feature switch and storage migration rollback. Done means generic UI works for at least EE plus one non-EE fixture and passes parity/accessibility gates.
