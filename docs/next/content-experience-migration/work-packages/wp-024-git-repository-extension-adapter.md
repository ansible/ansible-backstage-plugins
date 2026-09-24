# WP-024 — Git repository extension adapter

| Field      | Value                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------- |
| Phase      | 7 — Portal composition                                                                   |
| Depends on | WP-023                                                                                   |
| Target     | Git repository frontend contribution adapter                                             |
| Outcome    | Current Git repository API/UI is bridged into the generic extension host without rewrite |

## Human summary

**Why this matters:** Existing Git repository pages must work in the new extension host without forcing a risky rewrite or weakening repository permissions.

**What will change:** Current Git routes, cards, tabs, actions, columns, links, state, permissions, and application programming interface bindings will be wrapped as generic extension contributions. Provider-specific capabilities will be preserved and shown only when supported.

**PR scope:** Capture current behavior, add compatibility mappings and applicability rules, register the Git contributions in the new host slots, compare static and hosted behavior, and remove direct host conditionals after rollback tests pass.

**Not in this PR:** It will not move Git transport or backend client logic into the frontend, broaden host allowlists, or redesign the existing Git experience.

**Success looks like:** Existing views, deep links, browser state, interactions, and accessibility remain consistent across GitHub, GitLab, and approved Gitea behavior. Denied users see no repository data, and removing or failing the adapter leaves the generic portal healthy.

## Scope and changes

Wrap current Git repository routes, cards, tabs, actions, columns, API refs, links, permissions, and state as extension contributions. Preserve behavior and provider-specific capabilities while translating to generic content/source contracts. Do not move Git transport into frontend code or broaden host allowlists.

```ts
export const gitRepositoryExtension = createContentFrontendExtension({
  id: 'git-repository',
  contractVersion: '1.0.0',
  cards: [gitRepositorySummaryCard],
  routes: [gitRepositoryRoute],
});
```

## Implementation slices

1. Capture current Git route/API/UI/browser-state and permission fixtures.
2. Add compatibility API mapping and applicability predicates.
3. Register Git contributions through all applicable WP-023 slots.
4. Compare static and extension-host behavior/visuals.
5. Remove direct host conditionals after dynamic runtime and rollback tests.

## Required tests

- Route/deep-link, API/error, cards/tabs/actions/columns/links, visual, interaction, accessibility, and browser-state parity.
- GitHub/GitLab/Gitea capability differences or approved dated Gitea deviation.
- Permission/direct-route behavior and sensitive repository metadata redaction.
- Missing provider/backend, lazy-load failure, artifact removal, and upgrade.
- No Git protocol/backend/client code in the frontend contribution.

### Acceptance criteria

- Given an existing Git repository view, the extension-host version preserves approved behavior and links.
- Given an unsupported provider capability, UI omits/disables it explicitly rather than failing.
- Given adapter removal, the generic portal remains healthy with no stale navigation or route owner.
- Given denied access, direct routes and API calls reveal no repository data.

## Rollback and completion

Restore static registration while retaining compatibility APIs. Done means current Git fixtures pass through the generic host and exact runtime ownership is recorded by WP-043.
