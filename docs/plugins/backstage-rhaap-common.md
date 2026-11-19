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
package re-exports the reference. `AAPClient` and its configuration/organization
helpers live in the reusable `@ansible/aap-node` library. The concrete
`ansibleServiceFactory` and loadable default export live in `@ansible/aap-backend`.
The common package keeps compatibility exports for existing consumers.
Import compatibility through the common package does not register the service.

### Native Backstage hosts

Register the factory once in the host. Both named modules and default package
loaders can then consume the service. For example:

```ts
import { createBackend } from '@backstage/backend-defaults';
import { ansibleServiceFactory } from '@ansible/aap-backend';
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

`catalog-backend-module-aap` is the single transitional owner of the AAP factory
for split deployments. Enable its default dynamic plugin for AAP-only installs,
or together with `catalog-backend-module-content` for a full split. Auth,
scaffolder, and user-provisioner loaders register only their modules. No
host-level AAP client factory registration is required for those combinations.

The deprecated `catalog-backend-module-rhaap` shim remains the factory owner
only for legacy all-in-one bundles. Do not load the shim together with the
split modules.

For dynamic JIT user provisioning, use the AAP catalog alpha entry point with
the auth and user-provisioner modules, unless the host explicitly registers a
shared factory for `userProvisionerRef` (`rhaap.user-provisioner`). The default
AAP catalog loader does not register that shared factory. Legacy shim alpha also
supplies the organization resolver. The user-provisioner module must register
its creation callback, and the catalog must connect its provider before JIT
requests can succeed. Install exactly one catalog entry point. Service
registration order alone does not establish readiness for JIT requests.

Auth, scaffolder, and user-provisioner loaders do not provide the AAP factory
on their own. A dynamic deployment without the catalog loader must explicitly
provide `ansibleServiceFactory` through its host or a dedicated service provider.
Keeping the common package embedded in a dynamic artifact only makes its code
available; embedding does not register the factory.

The old factory export remains as a deprecated adapter built directly on
`@ansible/aap-node`; it does not import `@ansible/aap-backend`. Catalog/helper
artifacts therefore embed the shared libraries without embedding the backend.
New client/helper consumers import node directly. Retire the legacy adapter
with the remaining common-package cleanup; do not register it together with
the explicitly installed backend factory.

The next change transfers installation responsibility to an explicit
`@ansible/aap-backend` registration and replaces this transitional catalog
ownership. The service reference stays in `@ansible/aap-node` without importing
the factory package or defining a default factory.

## Related modules

- [AAP catalog module](catalog.md): scheduled catalog synchronization.
- [AAP authentication](auth.md): authentication provider.
- [User provisioning](catalog-user-provisioner.md): on-demand catalog users.
- [AAP scaffolder module](scaffolder.md): resource creation and job launch actions.

For provider-specific connection configuration, use the related module's guide.
