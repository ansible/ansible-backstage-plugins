# ADR-022: Multi-Org RBAC and Auth

**Audience:** `common` — see [ADR index](../index.md).

- **Status**: Accepted (frontend filtering superseded by [ADR-023](../host/023-per-template-rbac-filtering.md); auth provider mapping and AAP-as-source-of-truth decisions remain active)
- **Note**: Filtering mechanism superseded by [ADR-023](../host/023-per-template-rbac-filtering.md). Auth provider mapping and AAP-as-source-of-truth decisions remain active.
- **Date**: 2026-06-22
- **Deciders**: Portal team

## Context

Portal supports multiple authentication providers (AAP OAuth, GitHub/GitLab OAuth, Keycloak). Each provides different levels of access to AAP resources. With multi-org support, the question is how to control which templates a user can see based on their identity and AAP permissions, without requiring administrators to duplicate AAP's RBAC configuration in Portal.

AAP has a comprehensive RBAC model (38 role definitions across content types) and filters API responses based on the authenticated user's role assignments. When a user queries job templates with their AAP token, AAP returns only templates they have execute permission on.

## Alternatives Considered

| Alternative                                                 | Source                  | Why Rejected                                                                                                                                                                     |
| ----------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sync AAP RBAC to Backstage policies at catalog sync time    | Architecture discussion | Scale: thousands of per-user per-resource policies overwhelm Casbin. Staleness: role changes not reflected until next sync. Drift: two sources of truth for same access control. |
| Namespace-based RBAC policies (org X sees only namespace X) | Architecture discussion | Too coarse: AAP allows cross-org template access (user in Engineering can have execute on SecOps template). Would hide legitimately accessible templates.                        |
| Redis per-user cache between catalog and frontend           | Architecture discussion | New infrastructure dependency. Cache population still requires one AAP query per user. Optimization, not architecture change.                                                    |

## Decision

AAP is the single source of truth for job template permissions. No RBAC replication in Portal.

### How it works today (already implemented)

The self-service Home page already implements per-user filtering:

1. `fetchJobTemplates()` calls AAP autocomplete endpoint with the **user's OAuth token**
2. AAP returns only job templates the user has execute permission on
3. `catalogApi.getEntities({ kind: 'Template' })` fetches all catalog entities
4. `isHomePageTemplate()` cross-references: entities with `aapJobTemplateId` are shown only if AAP returned them; custom templates (no `aapJobTemplateId`) are always shown

### Auth-provider-to-visibility mapping

| Auth Provider                    | AAP Token Available | Job Templates                           | Custom Templates | EE Builder             |
| -------------------------------- | ------------------- | --------------------------------------- | ---------------- | ---------------------- |
| AAP OAuth                        | Yes                 | Filtered by AAP RBAC                    | Visible          | Yes (via ScmAuth)      |
| GitHub/GitLab OAuth              | No                  | Hidden                                  | Visible          | Yes (native SCM token) |
| Keycloak (federated) _(planned)_ | Via mapping         | Query AAP with service token + username | Visible          | Yes (via ScmAuth)      |

When `rhAapAuthApi.getAccessToken()` fails (no AAP session), the catch block fires, no job templates are returned, and the user sees only custom templates and EE builder content.

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
- No RBAC policy sync, no staleness, no drift
- Accurate real-time filtering — AAP evaluates permissions at query time
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
- `plugins/self-service/src/components/Home/Home.tsx` — `fetchJobTemplates()`, `isHomePageTemplate()`
- `plugins/auth-backend-module-rhaap-provider/src/resolvers.ts` — `issueTokenWithOwnership()`
- Backstage RBAC plugin: `workspaces/rbac/plugins/rbac-backend/src/policies/permission-policy.ts`
