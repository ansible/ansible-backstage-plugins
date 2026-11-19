# @ansible/aap-backend

Backstage service factory registration for AAP. The reusable `AAPClient`,
configuration readers, organization/job/PAH helpers and service contracts live
in `@ansible/aap-node`. Shared types, constants and permissions live in
`@ansible/aap-common`.

## Exports

- `ansibleServiceFactory`, also exported as the default backend feature.

The factory creates the existing node-library client with backend configuration
and a plugin-scoped logger. The service ID remains `rhaap.client.service`, with
plugin scope and no reference default factory. Ordinary backend consumers
request `ansibleServiceRef` from `@ansible/aap-node`.

## Installation

Register the service factory once in the source backend:

```ts
backend.add(import('@ansible/aap-backend'));
```

The catalog loaders no longer supply the client factory. Named modules and
package loaders need the same explicit owner. A custom host factory can be
installed instead; do not install competing explicit factories for the same
service. Dynamic deployments must separately enable the exported backend
artifact; embedding code is not service registration.

## Compatibility and packaging

The legacy common package forwards client/configuration exports to `aap-node`.
Its deprecated factory adapter also uses node directly and has no runtime
dependency on this backend package. This preserves the old factory import for
existing consumers without embedding the backend in catalog/helper artifacts.
Hosts whose catalog loader still supplies the deprecated factory must defer
explicit backend installation until that catalog registration is removed.
After the catalog handover, hosts install this backend explicitly. Do not
register its factory alongside the deprecated factory. Remove the legacy adapter
during the common-package cleanup. Embedding a package does not install its
service factory.
