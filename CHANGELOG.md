# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
where versioned packages apply.

## [Unreleased]

### Added

- **SDK relative time** adds the neutral `formatTimeAgo()` utility. Timestamp consumers no longer strip synchronization wording, and portal-scaffolder keeps its sync labels in a local wrapper. The existing SDK `formatRelativeTime()` remains available as a deprecated compatibility export with unchanged output.

- **SDK page header** adds `PageHeader` with a title, optional description/help, and consumer-owned actions. It requires no sync configuration or authentication APIs. Portal-scaffolder uses a local `CatalogSyncHeader` to retain existing sync controls, permission checks, progress, and timestamps. The SDK's `PageHeaderSection` and its props remain available as deprecated compatibility exports.

- **SDK empty-state view** adds `EmptyStateView` with consumer-owned text, optional decorative icon, and actions, without catalog or auth requirements. Portal-scaffolder keeps collection guidance and sync behavior in a local wrapper, while missing repositories show repository-specific guidance. Existing SDK `EmptyState` and props remain as deprecated compatibility exports.

- **Portal profile contributions** support owned-page navigation and lazy UI actions through `AppProfileMenuItemBlueprint`, explicit authentication/permission gates, and shared source/RHDH rendering. AAP owns its opt-in `app-profile-menu-item:app/aap-logout` declaration; `portal-rhdh` does not depend on AAP or need per-plugin menu changes. AAP OAuth transport handling is unchanged.

- **Portal development harness** supports optional full/scaffolder/core source-app composition and explicit additional workspace frontend discovery. Local RHDH development uses matching export/install selections and isolated installation roots; these conveniences do not introduce production profiles or npm publication requirements. The source header has no Create shortcut.

- **Portal landing route** supports `portal.landingPage` for an exact installed NFS page path. Without an override, `/` opens Templates only when installed; invalid or unavailable destinations show a neutral host fallback. Destination permission checks remain unchanged.

- **Portal NFS** native composition for self-service pages and third-party tabs, cards, actions, catalog extensions, and scaffolder fields, with configurable sidebar links and groups.

- Scaffolder **payload normalization** (`rhaapActionPayloadUtils`, `parseAapActionValues`) so `rhaap:*` actions receive consistent shapes for launch and resource-creation flows, with expanded unit tests.
- **Survey → JSON Schema** improvements for catalog-generated job templates: multiselect / multiple-choice **choices** normalized to string arrays; multiselect **defaults** normalized (including newline-separated strings); safer **Nunjucks** parameter references for variable names that are not simple identifiers (`parameters[...]`, `secrets[...]`).
- Self-service **Create Task** flow: clearer **review** display for nested objects; **sessionStorage** may retain bounded **`data:`** URLs across OAuth redirect so typical file uploads are not cleared (very large payloads may still be dropped to respect storage limits; **`blob:`** URLs remain cleared on reload).

### Changed

- **Portal global header** removes the Create shortcut from both native and legacy source-app composition. Profile-menu access and logout remain available. No global Create-contribution API is introduced.

- **Portal native fields** attach to the shared contribution provider instead of requiring portal-scaffolder's templates-page input. Optional templates adapters consume validated declarations; without a consumer, widget loaders do not run.

- **Portal SDK documentation** defines the proposed internal developer-preview contract, supported native launch combinations, backend responsibilities and exclusions, coordinated compatibility/migration policy, and fresh-clone workspace onboarding acceptance. Teams use this monorepo with `workspace:^` SDK dependencies; npm publication and external repositories are not preview requirements. This clarification does not announce published artifacts, joint contract sign-off, or new runtime guarantees.

- **Portal NFS** removes the experimental duplicate `/portal/catalog`, `/portal/entity/...`, and `/portal/start` UI; existing `/self-service/*` pages remain the user-facing destinations.

- **Catalog backend HTTP routes** (superuser manual sync triggers on the catalog plugin router):
  - **Removed:** `GET .../aap/sync_orgs_users_teams`, `GET .../aap/sync_job_templates`
  - **Use instead:** `GET .../ansible/sync/from-aap/orgs_users_teams`, `GET .../ansible/sync/from-aap/job_templates`
    The bundled self-service client was updated; custom scripts or integrations must call the new paths.
- **Create Task** final submit passes the AAP OAuth token **only** in scaffolder **`secrets`** as **`aapToken`**. It is no longer duplicated into template **`values.token`**. Templates should pass the token into actions explicitly, e.g. `token: ${{ secrets.aapToken }}` on `rhaap:*` steps (aligned with the `AAPTokenField` pattern).
- **Loose scaffolder `values` schema:** a single exported **`launchJobTemplateValuesLooseSchema`** is shared across all `rhaap:*` actions (the former duplicate export name was removed).
- **Launch credential normalization:** `credential_type` is only set when the type can be resolved from the credential or its `summary_fields`; it is no longer defaulted to `0`, avoiding spurious duplicate-type detection when metadata is missing.

### Fixed

- **AAP logout** shares one source/RHDH handler that waits for Portal identity sign-out, then uses AAP's OIDC end-session endpoint and the OAuth application's registered Post Logout Redirect URI to return to Portal sign-in after AAP confirmation. The public client ID and browser host are exposed through the auth module's frontend schema, while client secrets stay backend-only. Requires an AAP deployment advertising `/o/logout/`. Deployments configured only with `ansible.rhaap.baseUrl` must also set `auth.providers.rhaap.<environment>.clientId` and `app.baseUrl` as described in the upgrade notes. This does not bypass redirect validation or fix token-revocation transport errors.

- **Portal backend authorization** resolves trusted AAP memberships consistently across operation and registration transports, enforces declared entitlements server-side, and authorizes APME interactive workflows before gateway forwarding or SCM credential resolution. Any granted membership enables shared capabilities, subject to RBAC. Git repositories no longer require AAP ownership annotations or catalog namespace mappings; new manual entries use `default`, without rewriting existing records.

- **AAP identity and membership** aligns flag-controlled ID-based identities across authentication, scheduled catalog sync, and the extracted user provisioner; keeps direct organization membership separate from team membership and deduplicates catalog keys before mutation.

- **Frontend SDK context** reads authenticated backend memberships instead of deriving organization from the user namespace or falling back to `default`.

- **Workspace CI coverage** includes plugin source paths across all four workspaces and rejects empty filtered reports; Sonar source/test roots and generated-artifact exclusions now match the workspace layout.

- **Portal NFS app** restores distinct self-service sidebar icons, native RBAC and Settings pages, and the source development app's global header and account/logout controls.

- **AAP resource picker** (self-service): selection handling and typing for single vs multi-select resource lists.
- Various **Sonar** / quality findings in catalog survey generation and UI components.

### Upgrade notes

1. **AAP browser logout:** set `auth.providers.rhaap.<environment>.clientId` and `app.baseUrl`, using `auth.environment` to select the provider environment (default `development`). Set `auth.providers.rhaap.<environment>.host` or retain `ansible.rhaap.baseUrl` as the host fallback. Register the serialized value of `app.baseUrl` (`new URL(appBaseUrl).href`) in the matching OAuth application's Post Logout Redirect URIs. For example, `http://localhost:3000` serializes to `http://localhost:3000/`, and the registered URI must include that trailing slash. A host without the required client ID or valid Portal URL reports a configuration error and clears Portal auth without ending the AAP browser session.

1. **Native field contributors and templates hosts:** rebuild/re-export the shared SDK, Portal host, templates adapter, and contributors together. Remove explicit field attachment overrides to `page:portal-scaffolder/templates`; the Blueprint now attaches to `api:portal/contributions`, input `scaffolderFields`. Keep field names, manifests, template values, UI schemas, and validators unchanged. Custom templates composition tests must install the Portal contribution provider. Existing routes are unchanged; no legacy registration fallback is added.

1. **Backend SDK consumers:** inject `portalActiveOrganizationServiceRef` into identity middleware and use operation `requiredEntitlements` for server-side gates. `organizationId` is optional; multi-membership contexts carry `organizationIds`. Default organization-specific operations require one validated organization. Use `organizationScope: 'shared'` only for shared-resource operations. APME scanning requires a registered `apme.scanning` grant for any trusted membership as well as RBAC; registration/removal do not require scanning entitlement. Remove obsolete `portal.organization.catalogMappings`; `ansible.io/portal-organization` is no longer an AAP ownership boundary. Existing records are not rewritten.

1. **AAP deployments:** `multiOrgEnabled: true` uses stable AAP ID-based entity names, including `user:default/aap-user-<id>`, consistently across sign-in and provisioning. With the flag off, legacy usernames remain supported. Synchronize the catalog and sign in again when changing identity mode. Entitlement grants use canonical lowercase configured AAP organization names, not catalog namespaces or SCM owners.

1. **Frontend SDK consumers:** `usePortalContext` requires authenticated access to the host context endpoint. Handle `loading`, `error`, an optional `organizationId`, and multiple `organizationIds`; do not pass browser context as backend authorization authority.

1. **Experimental NFS callers:** replace links to the removed duplicate `/portal/*` UI with the corresponding `/self-service/*` pages. Removed routes do not silently redirect. With no `portal.landingPage` override, `/` opens Templates only when `/self-service` is installed; otherwise it displays the host fallback. Set an exact installed page path to override this behavior, including when NFS configuration moves the Templates page. This does not complete content extraction or optional deployment composition.

1. **Custom callers** of catalog sync GET endpoints: update URLs as listed above.
1. **Template authors:** ensure `rhaap:launch-job-template` (and other `rhaap:*` actions that require `token`) use **`secrets.aapToken`** (or your chosen secret key) in the template YAML, not `parameters.token`, if you relied on values carrying the token.
