# @ansible/backstage-rhaap-common

Shared AAP integration library. Source:
`workspaces/aap/plugins/backstage-rhaap-common`.

## Responsibilities

Provides the AAP client/service contracts, SCM utilities, resource types,
permissions, naming helpers, and user-provisioning service contracts.

Backend modules consume `ansibleServiceRef` to access the AAP service through
dependency injection. Frontend consumers use browser-safe exports and the
Portal/backend API seams rather than transporting AAP credentials directly.

## Related modules

- [AAP catalog module](catalog.md): scheduled catalog synchronization.
- [AAP authentication](auth.md): authentication provider.
- [User provisioning](catalog-user-provisioner.md): on-demand catalog users.
- [AAP scaffolder module](scaffolder.md): resource creation and job launch actions.

For provider-specific connection configuration, use the related module's guide.
