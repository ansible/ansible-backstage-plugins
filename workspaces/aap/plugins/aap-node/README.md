# @ansible/aap-node

Reusable backend AAP client, helpers and service contracts. Shared portable
types, constants and permissions remain in `@ansible/aap-common`.

## Exports

- `IAAPService` and the plugin-scoped `ansibleServiceRef`.
- `AAPClient`, implementing the existing 37-method service contract.
- `getAnsibleConfig`, `getCatalogConfig`, `resolveActiveOrganizations` and
  `findMissingConfiguredOrganizations`.
- Existing client fixtures for compatibility.
- `UserProvisioner`, its consumer/wiring interfaces and `userProvisionerRef`.

The configuration schema travels with the client reader. Existing keys,
defaults, Git integration reads, PAH behavior, credentials and logging remain
unchanged. This package does not depend on `@ansible/aap-backend`.

## Service installation

Importing this library does not register an AAP service factory. The host
installs `@ansible/aap-backend`, whose default export supplies the factory for
`ansibleServiceRef`. The catalog loader temporarily supplies that factory
during the extraction handover.

Ordinary consumers request the reference through backend dependency injection.
Direct client construction remains available for the existing root-scoped
organization resolver and deliberately customized host implementations.
