# WP-030 — APME frontend registration

| Field            | Value                                                                               |
| ---------------- | ----------------------------------------------------------------------------------- |
| Phase            | 9 — APME modularization                                                             |
| Depends on       | WP-022 and WP-023                                                                   |
| Target           | APME frontend contribution package                                                  |
| Frozen plugin ID | `apme`                                                                              |
| Outcome          | APME tabs, actions, cards, columns, overlays, and settings compose through the host |

## Human summary

**Why this matters:** Ansible Policy & Modernization Engine (APME) needs to plug its user interface into the portal through supported extension points instead of relying on host-specific conditions and static wiring.

**What will change:** APME pages, tabs, actions, cards, columns, overlays, settings, navigation, permissions, and application programming interface (API) bindings will be registered as one frontend contribution while preserving current routes and user behavior.

**PR scope:** Inventory the existing interface, extract reusable components and hooks, register each capability in the matching host slot, and add permission checks, lazy loading, failure isolation, and compatibility exports.

**Not in this PR:** This work does not extract the APME backend or perform the final browser-state migration certification. Generic content user-interface elements remain owned by the generic content plugin.

**Success looks like:** Every existing APME interface capability has exactly one registered owner, deep links and interactions still work, and removing or breaking APME does not prevent other portal content from working.

## Scope and changes

Register all APME frontend capability through WP-022/WP-023: routes/pages, quality and remediation tabs/cards, actions, table columns, overlays, settings, API refs, permissions, and navigation. Preserve current behavior and browser state for WP-045. APME presentation consumes APME APIs and published content contracts; generic content UI stays in its owner.

Until WP-029 publishes `apme-client`, this WP binds the frontend API refs to a frozen `ApmeApiPort` backed by the current APME client and WP-001 response/error fixtures. WP-029 must implement the same port with its typed client; swapping the binding cannot change frontend behavior. Backend extraction is therefore not a hidden completion prerequisite.

```ts
export const apmeExtension = createContentFrontendExtension({
  id: 'apme',
  contractVersion: '1.0.0',
  tabs: [qualityTab],
  actions: [scanAction],
  cards: [qualitySummaryCard],
  settings: [qualitySettingsContribution],
});
```

## Implementation slices

1. Freeze complete UI/route/slot/API/permission/browser-state inventory.
2. Extract components/hooks/API refs with compatibility re-exports.
3. Register each inventory item through the matching host slot.
4. Add permission/applicability, lazy loading, and isolated errors.
5. Compare static versus registered behavior and remove host conditionals.

## Required tests

- Inventory-to-registration completeness for tabs/actions/cards/columns/overlays/settings/routes/APIs.
- Route/deep-link, visual, interaction, accessibility, and browser-state parity.
- Permission/direct-route/action denial, semantic states, and sensitive findings.
- Missing backend, isolated component failure, multiple-provider ordering, add/remove/upgrade.
- Runtime dependency and dynamic descriptor checks.

### Acceptance criteria

- Given the baseline inventory, every APME UI capability has exactly one registered owner.
- Given APME is absent or fails, generic and other provider content remains usable.
- Given denied access, every entry point and API action is consistently unavailable.
- Given existing user state, WP-045 migration preserves approved selections/settings/routes.

## Rollback and completion

Re-enable static registration during the compatibility window. Done means registered APME UI passes full parity and is ready for dynamic extraction.
