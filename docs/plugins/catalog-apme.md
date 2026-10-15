# @ansible/backstage-plugin-catalog-backend-module-apme

Catalog backend module for APME integration. Source:
`workspaces/apme/plugins/catalog-backend-module-apme`.

## Responsibilities

- Registers APME routes under `/api/catalog/apme/*`.
- Provides the manual repository and learned-dependency entity providers.
- Registers `apme.repository.register`, `apme.repository.deregister`,
  and `apme.quality.scan` operation handlers and permissions.
- Registers the scanning entitlement, settings integration, and scheduled sync.
- Pushes initialization and synchronization health through the Portal health service.

## Integration

```ts
backend.add(import('@ansible/backstage-plugin-catalog-backend-module-apme'));
```

Install the Portal root services and configure the APME gateway. A disabled APME
configuration skips this module's registration; enablement does not bypass
permissions or entitlements.

Deregistration removes the manual catalog registration or stops relevant Portal
tracking. It does not delete the Git repository or APME project/history.
See [APME frontend](backstage-apme.md) and
[operations backend](portal-operations-backend.md).
