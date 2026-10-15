# @ansible/portal-plugin-node

Server-side SDK for Ansible portal backend plugins. Provides identity middleware, push-based health reporting, structured audit logging, and org-keyed database helpers.

## When to use this package

- You are writing a **backend plugin** (Backstage backend module or Express router) that participates in the Portal ecosystem.
- You need to attach `req.portalContext` (trusted memberships and user ref) to authenticated requests.
- You want to report plugin health to the aggregated health endpoint.
- You want to emit structured audit log entries for state-changing operations.
- You need to scope database queries by organization ID.

## Installation

```bash
yarn workspace my-backend-plugin add @ansible/portal-plugin-node
```

## Quick start

```ts
import {
  createPortalPlugin,
  portalActiveOrganizationServiceRef,
} from '@ansible/portal-plugin-node';

// Create once per backend module
const portalPlugin = createPortalPlugin({ pluginId: 'my-plugin' });

// In your Backstage backend module init:
export const myBackendModule = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'my-module',
  register(reg) {
    reg.registerInit({
      deps: {
        logger,
        httpAuth,
        userInfo,
        scheduler,
        organizations: portalActiveOrganizationServiceRef,
      },
      async init({ logger, httpAuth, userInfo, organizations }) {
        // Configure logger and attach identity middleware to your router
        const middleware = portalPlugin.createMiddleware({
          httpAuth,
          userInfo,
          logger,
          organizations,
        });
        router.use(middleware);

        // Signal readiness after workers are initialized
        portalPlugin.pushHealthStatus({
          state: 'READY',
          message: 'Workers healthy.',
        });
      },
    });
  },
});
```

## API

### `createPortalPlugin(options)`

Factory that returns a `PortalPlugin` instance. Create one instance per backend plugin module — the instance wraps a shared `HealthRegistry` keyed by `pluginId`.

```ts
const portalPlugin = createPortalPlugin({ pluginId: 'my-plugin' });
```

**Options:**

| Field      | Type     | Description                                                                                                                                                 |
| ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pluginId` | `string` | Unique stable ID. Convention: `'<team>-<domain>'` (e.g. `'apme'`, `'content-quality'`). Used as the health registry key and `plugin` field in audit events. |

### `PortalPlugin`

The object returned by `createPortalPlugin`. All methods are documented below.

#### `.createMiddleware(options)`

Creates an Express `RequestHandler` that attaches `req.portalContext` to every authenticated request.

```ts
const middleware = portalPlugin.createMiddleware({
  httpAuth,
  userInfo,
  logger,
  organizations,
});
router.use(middleware);
```

Also configures the plugin's audit emitter with the provided logger.

**Options:**

| Field           | Type                         | Description                                                                        |
| --------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| `httpAuth`      | `HttpAuthService`            | Backstage HTTP auth service                                                        |
| `userInfo`      | `UserInfoService`            | Backstage user info service                                                        |
| `logger`        | `LoggerService`              | Logger for auth failures                                                           |
| `organizations` | `ActiveOrganizationResolver` | Injected host resolver for trusted memberships, independent of identity namespace. |
| `defaultOrgId?` | `string`                     | Deprecated and ignored; configure the host resolver instead.                       |

The middleware never blocks unauthenticated requests — route handlers must check for `req.portalContext` when they require it. Unresolved identity or organization clears any stale context. Missing organization does not fall back to the user's namespace.

`resolvePortalContext` returns `organizationId` for one membership or
`organizationIds` for several; the latter does not choose an active organization.
The AAP adapter validates current direct/team memberships against configured
organizations. Resolver implementations can expose `resolveAll(credentials)`;
the shared `resolveOrganizationMemberships` helper also supports existing
single-organization `resolve(credentials)` adapters.

Operation descriptors default to `organizationScope: 'organization'` and require
one validated organization. Shared-resource operations opt into
`organizationScope: 'shared'`; any granted membership enables their required
capability, subject to operation and resource RBAC. Shared Git repositories need
no AAP ownership annotation or catalog namespace mapping. See the
[operations reference](../../../../docs/plugins/portal-operations-backend.md)
for policy examples and identity compatibility.

**TypeScript augmentation:** Declare `req.portalContext` in your module:

```ts
// In a .d.ts file or at the top of your router file:
declare global {
  namespace Express {
    interface Request {
      portalContext?: PortalContext;
    }
  }
}
```

#### `.pushHealthStatus(status)`

Pushes a health status update to the process-level `HealthRegistry`.

```ts
// Signal healthy:
portalPlugin.pushHealthStatus({
  state: 'READY',
  message: 'Sync workers healthy.',
});

// Signal degraded (e.g. partial sync failure):
portalPlugin.pushHealthStatus({
  state: 'DEGRADED',
  message: 'Sync failed for org: acme.',
});

// Signal unavailable:
portalPlugin.pushHealthStatus({
  state: 'UNAVAILABLE',
  message: 'DB connection lost.',
});
```

Health states:

| State         | When to use                                                  |
| ------------- | ------------------------------------------------------------ |
| `READY`       | Plugin initialized and all workers are running               |
| `DEGRADED`    | Plugin is running but some functionality is reduced          |
| `UNAVAILABLE` | Plugin failed to initialize or a critical dependency is down |
| `UNKNOWN`     | Initial state before the plugin has reported                 |

The status is readable via `GET /api/portal-health/status` (provided by `@ansible/portal-health-backend`).

**Deduplication pattern:** Track failure state to avoid pushing `DEGRADED` on every recurring failure:

```ts
let wasDegraded = false;

// In your sync error handler:
if (!wasDegraded) {
  portalPlugin.pushHealthStatus({
    state: 'DEGRADED',
    message: `Sync failed: ${err.message}`,
  });
  wasDegraded = true;
}

// In your sync recovery handler:
if (wasDegraded) {
  portalPlugin.pushHealthStatus({ state: 'READY', message: 'Sync recovered.' });
  wasDegraded = false;
}
```

#### `.emitAuditEvent(event)`

Emits a structured audit log entry. Requires a logger (call `createMiddleware` or `withLogger` first).

```ts
const context = req.portalContext;
if (!context) {
  throw new Error('Authenticated Portal context is required');
}
portalPlugin.emitAuditEvent({
  operationId: 'my-plugin.jobs.launch',
  userId: context.userId,
  organizationId: context.organizationId,
  organizationIds: context.organizationIds,
  input: { jobTemplateId, extraVars },
  outcome: 'SUCCESS',
});
```

**`AuditEvent` fields:**

| Field             | Type                      | Required | Description                                                  |
| ----------------- | ------------------------- | -------- | ------------------------------------------------------------ |
| `operationId`     | `string`                  | ✓        | Dot-namespaced operation ID, e.g. `'my-plugin.jobs.launch'`  |
| `userId`          | `string`                  | ✓        | Catalog user name from `req.portalContext`; may be ID-based. |
| `organizationId`  | `string`                  | —        | Single validated organization, when available.               |
| `organizationIds` | `readonly string[]`       | —        | Trusted memberships; not resource ownership.                 |
| `outcome`         | `'SUCCESS' \| 'FAILURE'`  | ✓        | Result of the operation                                      |
| `input`           | `Record<string, unknown>` | —        | Sanitized input parameters                                   |
| `error`           | `string`                  | —        | Error message on `FAILURE` outcome                           |

#### `.withLogger(logger)`

Configures the audit emitter with a logger. Call this if you need to emit audit events before calling `createMiddleware`.

```ts
const portalPlugin = createPortalPlugin({ pluginId: 'my-plugin' }).withLogger(
  logger,
);
```

Returns the same `PortalPlugin` instance for chaining.

#### `.getHealthStatus()`

Returns the current `HealthStatus` for this plugin:

```ts
const status = portalPlugin.getHealthStatus();
// { state: 'READY', message: 'Workers healthy.' }
```

### `createIdentityMiddleware(options)` / `parseEntityRef(ref)`

Lower-level exports if you need to create the identity middleware without a `PortalPlugin` wrapper:

```ts
import { createIdentityMiddleware } from '@ansible/portal-plugin-node';
const middleware = createIdentityMiddleware({
  httpAuth,
  userInfo,
  logger,
  organizations,
});
```

### `HealthRegistry` / `getAllHealthStatuses()`

The `HealthRegistry` is a process-level singleton keyed by `pluginId`. The host's `portal-health-backend` plugin reads from it to serve the aggregated health endpoint.

```ts
import { getAllHealthStatuses } from '@ansible/portal-plugin-node';

// Returns Record<string, HealthStatus> for all registered plugins
const snapshot = getAllHealthStatuses();
```

### `withOrganization(orgId, fn)`

Validates a non-empty organization key and passes it to your callback. The
callback must apply the key to its queries; the helper does not create a
transaction or automatically filter queries. Use it for organization-specific
domain state, not to assign an AAP organization to a shared catalog repository.

```ts
import { withOrganization } from '@ansible/portal-plugin-node';

const organizationId = req.portalContext?.organizationId;
if (!organizationId) {
  throw new Error('A single validated organization is required');
}
const results = await withOrganization(organizationId, orgId =>
  db('my_table').where({ org_id: orgId }).select('*'),
);
```

### `AuditEmitter`

The class backing `emitAuditEvent`. For advanced use cases, instantiate directly:

```ts
import { AuditEmitter } from '@ansible/portal-plugin-node';

const emitter = new AuditEmitter('my-plugin', logger);
emitter.emit({ operationId: 'my-plugin.items.delete', ... });
```

## Types

```ts
import type {
  CreatePortalPluginOptions,
  PortalPlugin,
  PortalContext,
  HealthStatus,
  HealthState,
  AuditEvent,
  AuditOutcome,
  IdentityMiddlewareOptions,
} from '@ansible/portal-plugin-node';
```

## Health status in the backend

Plugin health is exposed by `@ansible/portal-health-backend` at `GET /api/portal-health/status`. Register the plugin in your backend:

```ts
// packages/backend/src/index.ts
backend.add(import('@ansible/portal-health-backend'));
```

The frontend `PortalHealthStatus` component (from `@ansible/portal-extension-host`) polls this endpoint and renders the results. See that package's README for usage.

## Peer dependencies

- `express` ^4
- `@backstage/backend-plugin-api`
