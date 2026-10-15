# @ansible/portal-health-backend

Backend plugin for aggregated Portal plugin health. Source:
`workspaces/portal-core/plugins/portal-health-backend`.

## Integration

Register the backend plugin alongside the Portal root services:

```ts
backend.add(import('@ansible/portal-health-backend'));
```

The endpoint `GET /api/portal-health/status` returns a snapshot keyed by plugin
ID. Backend plugins report through the health service supplied by
`@ansible/portal-plugin-node`. States include `READY`, `DEGRADED`,
`UNAVAILABLE`, and `UNKNOWN`.

## Verification

Look for `portal-health: starting health aggregation endpoint` at startup.
Use the host's authenticated API access to inspect the status endpoint.
A missing report is not proof that a backend is healthy.

The aggregator does not create a UI page or header indicator. See
[portal-plugin-node](portal-plugin-node.md) for backend SDK responsibilities.
