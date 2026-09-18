# WP-023 — Multi-provider extension host

| Field      | Value                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------- |
| Phase      | 7 — Portal composition                                                                   |
| Depends on | WP-022 and WP-043                                                                        |
| Target     | Portal frontend host                                                                     |
| Outcome    | Multiple independent providers compose predictably with permission and failure isolation |

## Human summary

**Why this matters:** The portal must combine features from several independent providers without unpredictable ordering, permission gaps, or one broken provider taking down the rest of the experience.

**What will change:** The frontend host will gain registries and slots for routes, cards, tabs, actions, columns, overlays, settings, fields, and application programming interfaces. Generic theme, navigation, authentication, sign-in, logout, and browser-cleanup behavior will move into reusable portal packages while preserving current static behavior.

**PR scope:** Deliver the host as the ordered PR series below: first freeze contracts and add the registry, then add isolated loading and authorization, then extract reusable shell/authentication packages, and finally migrate the application composition root and provider fixtures. Every PR retains the static fallback and is independently reversible.

**Not in this PR:** Ansible Automation Platform (AAP) provider, backend, and domain-specific behavior will not move into the generic theme or authentication packages.

**Success looks like:** Multiple providers appear in documented order, an incompatible or failing provider is isolated with useful diagnostics, and provider removal leaves the portal usable with no broken navigation or chrome. Static and dynamic Red Hat Developer Hub (RHDH) deployments retain route, visual, sign-in, and logout parity.

## Scope and changes

Implement registries and host slots for routes, cards, tabs, actions, columns, overlays, settings, fields, and APIs. Extract the generic portal shell packages that host them: `portal-theme` owns layout/header/sidebar/themes/branding/base navigation/shared feedback placement; `portal-auth-common` owns portable principal/credential-routing/logout-event contracts; and `portal-auth-frontend` owns provider settings, sign-in/logout composition, and browser cleanup. AAP provider/backend/domain behavior remains outside these core packages. Define deterministic ordering, ID collision, applicability, contract compatibility, permission filtering, lazy loading, and per-contribution failure isolation. Preserve the exact static app sign-in, `/ansible` mount handoff, icon/listener/menu ordering, and current static composition as a temporary fallback.

```tsx
<ExtensionSlot
  contributions={registry.resolve('content.cards', context)}
  renderError={(id, error) => (
    <IsolatedExtensionError extensionId={id} error={error} />
  )}
/>
```

## Implementation slices

1. Freeze current host slots, shell/theme/branding, sign-in/logout, provider composition, feedback placement, navigation, icons/listeners, and static/dynamic behavior.
2. Implement registry/provider, ordering, collision, and compatibility validation.
3. Add lazy component/API resolution with isolated loading/error boundaries.
4. Integrate backend permission/applicability decisions and dynamic runtime ledger.
5. Migrate one built-in plus two independent provider fixtures and test removal.
6. Publish `portal-theme`, `portal-auth-common`, and `portal-auth-frontend`; reduce `packages/app` to a thin composition root without moving AAP authentication implementation into core.

## Ordered PR series

1. **Host contracts and registry:** freeze the inventories and add registry, ordering, collision, and compatibility behavior with no production composition switch.
2. **Isolation and authorization:** add lazy resolution, loading/error boundaries, backend permission/applicability integration, and runtime ledger behind the static fallback flag.
3. **Reusable shell packages:** publish `portal-theme`, `portal-auth-common`, and `portal-auth-frontend` while static composition remains the default consumer.
4. **Composition migration:** migrate the built-in and independent-provider fixtures, reduce `packages/app` to the composition root, and switch the guarded default only after parity evidence passes.

Each PR must pass its applicable tests below, leave the repository releasable, and be revertible without reverting a later PR out of order.

## Required tests

- Empty/single/multiple provider, ordering, collision, unsupported version, add/remove/upgrade, and lazy-load failure.
- Direct route and host-slot permission behavior; hidden UI does not grant access.
- One failing provider does not break unrelated providers or generic shell.
- Accessibility, focus/order, loading/error/empty states, and visual regression.
- Static and representative dynamic RHDH registration.
- Shell visual/route/navigation and sign-in/logout/browser-cleanup parity, including provider unavailable and plugin removal.

### Acceptance criteria

- Given two applicable providers, both compose in deterministic documented order.
- Given duplicate identity or incompatible contract, the offending provider is rejected with actionable diagnostics.
- Given provider failure/removal, other content remains usable and no broken chrome remains.
- Given denied access, route, navigation, slot, and backend result are consistent.

## Rollback and completion

Feature-flag static composition while new host stabilizes. Done means independently packaged provider fixtures install/remove without host source edits.
