# ADR-020: Multi-Org Namespace Isolation

**Audience:** `common` — see [ADR index](../index.md).

- **Status**: Accepted (entity naming and namespace assignment partially superseded by [ADR-027](027-catalog-entity-naming-and-namespaces.md))
- **Date**: 2026-06-22
- **Deciders**: Portal team
- **See also**: [ADR-027](027-catalog-entity-naming-and-namespaces.md) — `{source}-{type}-{id}` entity names when flag on; namespaces hybrid on `multiOrgEnabled` (off → `default`, on → `{source}-{org-id}`); users hybrid (off → raw username, on → `{source}-user-{id}` + auth by id)

## Context

Platform admins running multiple AAP Organizations within a single AAP instance need Portal to sync resources from all configured orgs without entity name collisions. Two orgs can each have a team called "Engineering" or a job template called "Deploy App." Backstage requires unique entity names within a namespace, so a disambiguation mechanism is needed.

Additionally, the Backstage-reserved `default` namespace must not collide with an AAP organization named "Default."

## Alternatives Considered

| Alternative                                                          | Source             | Why Rejected                                                                                    |
| -------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| Prefixed names in single namespace (e.g., `engineering-deploy-team`) | Team discussion    | Breaks entity ref stability when orgs are added/removed; pollutes entity names with org context |
| Custom entity kind per org (e.g., `kind: AAPTemplate`)               | Backstage patterns | Non-standard; breaks catalog search, RBAC policies, and plugin compatibility                    |
| Separate Portal instance per org                                     | Deployment model   | Operational overhead; defeats the purpose of a shared developer portal                          |

## Decision

Use Backstage namespaces to isolate entities per AAP organization via `getEffectiveNamespace()`:

1. **Single-org mode** (1 org configured): all entities stay in the `default` namespace. Zero disruption on upgrade. `getEffectiveNamespace()` returns `"default"` when `allOrgs.length <= 1`.

2. **Multi-org mode** (2+ orgs configured): teams and job templates use org-scoped namespaces. `formatNameSpace()` converts org names to Backstage-safe namespace strings:
   - Lowercase, `[a-z0-9-]` charset only
   - Underscores and spaces converted to hyphens
   - Truncated to 63 characters (Kubernetes namespace limit)
   - `"Default"` maps to `"default"` in both single-org and multi-org mode

3. **Users and organizations** stay in the `default` namespace regardless of mode. Users can belong to teams across multiple orgs via cross-namespace membership refs.

4. **`aap-admins` superuser group** always stays in the `default` namespace for cross-org RBAC.

5. **Namespace validation** runs at config parse time. Invalid org names (special-char-only, empty result) and namespace collisions (two org names that sanitize to the same namespace, e.g., "My Org" and "my-org") are rejected at startup.

### Entity namespace mapping

| Entity       | Single-org                         | Multi-org                             |
| ------------ | ---------------------------------- | ------------------------------------- |
| Organization | `group:default/<org-slug>`         | `group:default/<org-slug>`            |
| Team         | `group:default/<team-name>`        | `group:<org-slug>/<team-name>`        |
| Job Template | `template:default/<template-name>` | `template:<org-slug>/<template-name>` |
| User         | `user:default/<username>`          | `user:default/<username>`             |
| aap-admins   | `group:default/aap-admins`         | `group:default/aap-admins`            |

## Consequences

### Positive

- Entity name collisions eliminated — same-named resources in different orgs coexist safely
- Single-org customers have zero disruption — no namespace changes on upgrade
- Backstage-native approach — uses standard namespace mechanism, compatible with RBAC, search, and catalog APIs
- Org attribution via `ansible.com/organization` annotation enables UI disambiguation without changing entity names

### Negative

- Frontend components must be namespace-aware (entity refs, navigation URLs, scaffolder template refs)
- RBAC policies referencing team groups must update entity refs when transitioning from single-org to multi-org
- Bookmarks, favorites, and external integrations referencing old entity refs need manual updates

## Related

- [ANSTRAT-912](https://redhat.atlassian.net/browse/ANSTRAT-912) — Portal multi-org support
- PR #408 — Implementation (upstream)
- ADR-021 — Template type taxonomy (related)
- ADR-022 — Multi-org RBAC and auth (related)
- `plugins/catalog-backend-module-rhaap/src/helpers.ts` — `formatNameSpace()`, `getEffectiveNamespace()`, `validateNamespace()`
