# @ansible/backstage-apme-common

Shared library for APME frontend and backend integrations. Source:
`workspaces/apme/plugins/backstage-apme-common`.

## Shared contracts

Provides APME types, configuration helpers, client/service contracts, repository
normalization, scan-target resolution, operation status, and severity utilities.
The `./operations` export declares repository registration/deregistration,
quality scan operations, permissions, and the scanning entitlement.

Browser-only exports such as `./api` and `./useApmeEnabled` are separate entry
points. Backend modules must not import frontend API hooks.

## Related packages

- [APME frontend](backstage-apme.md): native presentation contributions.
- [APME catalog module](catalog-apme.md): operation handlers, routes, and providers.
- [APME scaffolder module](scaffolder-apme.md): repository-registration action.

Use Portal contracts for operation transport and host contribution metadata;
keep APME-specific assessment behavior in APME packages.
