# @ansible/backstage-rhaap-common

Shared AAP integration library. Source:
`workspaces/aap/plugins/backstage-rhaap-common`.

## Responsibilities

Provides the AAP client/service contracts, SCM utilities, resource types,
permissions, naming helpers, and user-provisioning service contracts.

Backend modules consume `ansibleServiceRef` to access the AAP service through
dependency injection. Frontend consumers use browser-safe exports and the
Portal/backend API seams rather than transporting AAP credentials directly.

## AAP service registration during the package split

`ansibleServiceRef` now comes from `@ansible/aap-node` and has no default
factory. Its ID remains `rhaap.client.service`, with plugin scope. The common
package re-exports the reference and retains `ansibleServiceFactory` alongside
`AAPClient` until the implementation moves to `@ansible/aap-backend`.
Import compatibility through the common package does not register the service.

### Native Backstage hosts

Register the factory once in the host. Both named modules and default package
loaders can then consume the service. For example:

```ts
import { createBackend } from '@backstage/backend-defaults';
import { ansibleServiceFactory } from '@ansible/backstage-rhaap-common';
import { catalogModuleRhaap } from '@ansible/backstage-plugin-catalog-backend-module-rhaap';
import { scaffolderModuleAnsible } from '@ansible/plugin-scaffolder-backend-module-backstage-rhaap';

const backend = createBackend();
backend.add(ansibleServiceFactory);
backend.add(catalogModuleRhaap);
backend.add(scaffolderModuleAnsible);
// Also install the catalog and scaffolder backend plugins and other required services.
```

This registration is also required for installations that use only auth,
scaffolder, or user-provisioner modules without a catalog package loader.

### RHDH dynamic installations

The catalog package is the single transitional owner of the AAP factory.
Enable its default dynamic plugin together with the auth, scaffolder, and
user-provisioner dynamic plugins as needed. Its default loader registers the
factory; the other three loaders register only their modules. No host-level
factory registration is required for this combination.

The catalog alpha entry point is an alternative owner that also supplies the
organization resolver and shared UserProvisioner factory. Install either the
catalog default entry point or alpha entry point, once, rather than both.
The registration order of the modules does not matter.

Auth, scaffolder, and user-provisioner loaders do not provide the AAP factory
on their own. A dynamic deployment without the catalog loader must explicitly
provide `ansibleServiceFactory` through its host or a dedicated service provider.
Keeping the common package embedded in a dynamic artifact only makes its code
available; embedding does not register the factory.

When `@ansible/aap-backend` ships, it will become the explicit service owner and
replace this transitional catalog ownership. The service reference stays in
`@ansible/aap-node` without importing the concrete client.

## Related modules

- [AAP catalog module](catalog.md): scheduled catalog synchronization.
- [AAP authentication](auth.md): authentication provider.
- [User provisioning](catalog-user-provisioner.md): on-demand catalog users.
- [AAP scaffolder module](scaffolder.md): resource creation and job launch actions.

For provider-specific connection configuration, use the related module's guide.
