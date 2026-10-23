# ADR-022: Multi-Org RBAC and Auth

**Audience:** `common` — see [ADR index](../index.md).

- **Status**: Accepted (frontend filtering superseded by [ADR-023](../host/023-per-template-rbac-filtering.md); auth provider mapping and AAP-as-source-of-truth decisions remain active)
- **Note**: Filtering mechanism superseded by [ADR-023](../host/023-per-template-rbac-filtering.md). Auth provider mapping and AAP-as-source-of-truth decisions remain active.
- **Date**: 2026-06-22
- **Deciders**: Portal team

## Context

Portal supports multiple authentication providers (AAP OAuth, GitHub/GitLab OAuth, Keycloak). Each provides different levels of access to AAP resources. With multi-org support, the question is how to control which templates a user can see based on their identity and AAP permissions, without requiring administrators to duplicate AAP's RBAC configuration in Portal.

AAP filters API responses based on the authenticated user's role assignments. Listing job templates with a user's AAP token returns templates the user can read; read access does not by itself grant execute permission. AAP separately authorizes launching a template. Portal must not infer execute permission from membership in that list.

## Alternatives Considered

| Alternative                                                 | Source                  | Why Rejected                                                                                                                                                                     |
| ----------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sync AAP RBAC to Backstage policies at catalog sync time    | Architecture discussion | Scale: thousands of per-user per-resource policies overwhelm Casbin. Staleness: role changes not reflected until next sync. Drift: two sources of truth for same access control. |
| Namespace-based RBAC policies (org X sees only namespace X) | Architecture discussion | Too coarse: AAP allows cross-org template access (user in Engineering can have execute on SecOps template). Would hide legitimately accessible templates.                        |
| Redis per-user cache between catalog and frontend           | Architecture discussion | New infrastructure dependency. Cache population still requires one AAP query per user. Optimization, not architecture change.                                                    |

## Decision

AAP is the single source of truth for job template permissions. The current Home filter uses the user's AAP read visibility; it does not replicate execute permissions into Portal. The global execute-based catalog policy in ADR-023 is a separate, deferred design.

### How it works today (already implemented)

The self-service Home page already implements per-user filtering:

1. `JobTemplatesProvider` calls AAP with the **user's OAuth token** and records `ready` or `error`
2. AAP returns job templates readable with that user's token; the backend maps the returned IDs without applying an additional execute-permission filter
3. Home wraps `catalogApi.queryEntities()` via `createHomeCatalogApi()` with `buildVisibilityPredicate()`: show entities whose `metadata.aapJobTemplateId` is in that ID list, or that have no `aapJobTemplateId`
4. Catalog applies the predicate **before** pagination. `isHomePageTemplate()` no longer exists.

Home renders the catalog only when the job-template request is `ready`. An AAP session error shows the sign-in / retry message instead of a custom-template-only grid.

A readable template can still be non-executable. Launch handlers must retain AAP's execution authorization. If Home is required to show only executable templates, that needs a separate implementation change using verified start capabilities, with a regression case for a user who can read a template but cannot execute it.

### Auth-provider-to-visibility mapping

| Auth Provider                    | AAP Token Available | Job Templates                           | Custom Templates                        | EE Builder             |
| -------------------------------- | ------------------- | --------------------------------------- | --------------------------------------- | ---------------------- |
| AAP OAuth                        | Yes                 | Filtered by AAP RBAC                    | Visible (when the AAP request is ready) | Yes (via ScmAuth)      |
| GitHub/GitLab OAuth              | No                  | Hidden                                  | Not shown — Home shows the AAP error    | Yes (native SCM token) |
| Keycloak (federated) _(planned)_ | Via mapping         | Query AAP with service token + username | Same as AAP path once mapping exists    | Yes (via ScmAuth)      |

When there is no AAP session, `JobTemplatesProvider` is in `error` and Home does **not** fall back to custom templates. Users must sign in to AAP or retry.

### SuperUser cross-org access

AAP superusers have implicit access to all organizations. The auth resolver (`issueTokenWithOwnership` in PR #402) injects `group:default/aap-admins` into the token's ownership refs based on the `aap.platform/is_superuser` annotation. This works with:

- `omitIdentityTokenOwnershipClaim: true` — ownership refs flow through `UserInfoService`, not the JWT wire token
- RBAC plugin v7.9.0+ group-based superUser matching via `ownershipEntityRefs`
- Only **direct** group members match — no transitive inheritance

### SCM tokens

SCM tokens are acquired on demand via `scmAuthApi.getCredentials({ url: repoUrl })`, independent of the login provider. Users can authenticate with AAP OAuth for job templates and use GitHub/GitLab tokens for EE builder workflows in the same session.

## Consequences

### Positive

- Zero admin overhead — RBAC configured once in AAP, Portal respects it via user token
- No replicated execute-permission policy in the current Home filter
- Read visibility is evaluated by AAP when the list is fetched; changes after that fetch require a refresh, and launch remains separately authorized
- Multi-auth support — each provider's visibility is correct by design

### Negative

- Custom templates (SCM-imported) have no AAP RBAC — visible to all authenticated users. Restricting them requires Backstage RBAC conditional policies (separate from this decision).
- Per-page-load AAP query — adds latency. Acceptable at current scale; may need caching at scale.
- Keycloak/federated identity requires username mapping to AAP — not yet implemented.

## Related

- [ANSTRAT-912](https://redhat.atlassian.net/browse/ANSTRAT-912) — Portal multi-org support
- [AAP-80078](https://redhat.atlassian.net/browse/AAP-80078) — Custom permissions and RBAC epic
- PR #402 — `issueTokenWithOwnership` (merged)
- ADR-020 — Multi-org namespace isolation
- `workspaces/self-service/plugins/portal-scaffolder/src/components/Home/createHomeCatalogApi.ts` — `queryEntities` visibility predicate
- `workspaces/self-service/plugins/portal-scaffolder/src/components/Home/buildVisibilityPredicate.ts`
- `workspaces/aap/plugins/auth-backend-module-rhaap-provider/src/resolvers.ts` — `issueTokenWithOwnership()`
- Backstage RBAC plugin: `workspaces/rbac/plugins/rbac-backend/src/policies/permission-policy.ts`
