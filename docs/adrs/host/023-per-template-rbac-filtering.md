# ADR-023: Per-Template RBAC Visibility Filtering

**Audience:** `host` — see [ADR index](../index.md).

- **Status**: Accepted (implementation deferred from ANSTRAT-912)
- **Date**: 2026-07-08
- **Deciders**: Portal team
- **Supersedes**: ADR-022 frontend-based filtering approach
- **Design Doc**: 011 — Per-Template RBAC Design (research not published in this repository)

## Context

ADR-022 established that AAP is the single source of truth for job template permissions and described a frontend-based filtering approach: the self-service page queries AAP with the user's OAuth token, gets permitted template IDs, and cross-references against catalog entities client-side.

This approach has fundamental limitations:

- Catalog pagination happens before client-side filtering, causing empty pages and inaccurate counts
- The left sidebar filter shows the catalog total (e.g., 23) not the user's actual count (e.g., 1)
- Custom/SCM templates have no AAP permission model and can't be filtered the same way

## Alternatives Considered

| Alternative                                             | Why Rejected                                                                                                            |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Frontend autocomplete + client-side filtering (ADR-022) | Pagination breaks — catalog returns 20 entities per page, client filters to 3, user sees empty pages with "next" button |
| Annotation-based filtering (ansible.com/execute-users)  | Catalog search index uses varchar(255) — truncates for templates with >20 execute users                                 |
| DB table for execute mappings                           | toQuery() is synchronous — cannot make async DB calls inline during permission evaluation                               |
| Org-level filtering via IS_ENTITY_OWNER                 | Too coarse — user in Default org sees all 23 Default templates but may only execute 1                                   |
| Redis per-user cache                                    | New infrastructure dependency, same staleness issues                                                                    |

## Decision

Per-template visibility filtering at the database query level using a custom Backstage permission rule backed by an in-memory store.

### Architecture

1. **ExecutePermissionStore** — in-memory `Map<username, Set<templateId>>`, populated from AAP gateway API during catalog sync
2. **HAS_EXECUTE_PERMISSION** — custom catalog permission rule registered via `permissionsRegistry.addPermissionRules`
   - `apply()`: checks store for user+template match; templates without `aapJobTemplateId` return true (custom templates pass through)
   - `toQuery()`: returns `{ key: 'metadata.aapJobTemplateId', values: [user's template IDs] }` for SQL-level filtering
3. **permission-backend-module-rhaap** — RBAC provider (separate plugin, `pluginId: 'permission'`) auto-creates `role:default/aap-normal-user` with conditional policy on startup
4. **scope:local scheduled task** — every pod independently refreshes the store every 40 minutes (configurable) for HA support

### Conditional Policy

```json
{
  "conditions": {
    "anyOf": [
      {
        "rule": "HAS_EXECUTE_PERMISSION",
        "params": { "userEntityRef": "$currentUser" }
      },
      {
        "not": {
          "rule": "HAS_METADATA",
          "params": { "key": "aapJobTemplateId" }
        }
      }
    ]
  }
}
```

Show entity if user has AAP execute permission on it, OR entity is not an AAP template (custom/SCM templates, components, groups, users).

### AAP RBAC Model (confirmed from AWX source)

From `awx/main/models/jobs.py`:

```python
execute_role = ImplicitRoleField(
    parent_role=['admin_role', 'organization.execute_role'],
)
```

- Organization Member does NOT grant implicit JT execute — only visibility
- JT Admin implicitly includes JT Execute — both appear in `role_user_assignments`
- `role_user_assignments` returns direct assignments only
- `role_team_assignments` returns team-level assignments — must resolve team members separately

### Data Sources

| Source                  | API                                                                   | What it provides                       |
| ----------------------- | --------------------------------------------------------------------- | -------------------------------------- |
| Direct user assignments | `role_user_assignments/?content_type__model=jobtemplate`              | User X has Execute/Admin on template Y |
| Team assignments        | `role_team_assignments/?content_type__model=jobtemplate`              | Team Z has Execute on template Y       |
| Team members            | `role_user_assignments/?object_id=<team_id>&content_type__model=team` | Users in team Z                        |

## Consequences

### Positive

- Accurate template counts at the DB level — pagination works correctly
- No client-side filtering needed — frontend receives only permitted entities
- Custom/SCM templates unaffected — pass through for all users
- Zero admin setup — RBAC provider auto-creates policy on startup
- HA supported — each pod independently refreshes the store

### Negative

- In-memory store has 40-minute staleness window between pods in HA deployments
- Startup window (~30-60 seconds) where store is empty — all AAP templates hidden until first sync
- Store not shared across pods — each pod fetches from AAP independently
- Permission refresh frequency is configurable but hardcoded default (40 min)

### Neutral

- `spec.type` changed from `service` to `automation-template` (ADR-021) — visible in UI but required for clean type taxonomy
- `role:default/aap-normal-user` created with source `aap-rbac-provider` — admin changes via REST/CSV use different source and are untouched
- The permission rule runs in the catalog plugin context, not the permission plugin — architectural constraint of Backstage's `catalogEntityPermissionResourceRef`

## Related

- [AAP-80078](https://redhat.atlassian.net/browse/AAP-80078) — Custom permissions and RBAC epic
- PR #466 — Implementation (upstream)
- ADR-022 — Multi-org RBAC and Auth (superseded for filtering; auth decisions remain active)
- ADR-020 — Multi-org namespace isolation
- Per-template RBAC design notes (not published in this repository)
