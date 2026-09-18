# WP-013 — Permission/audit pipeline

| Field      | Value                                                                            |
| ---------- | -------------------------------------------------------------------------------- |
| Phase      | 4 — Read/write API                                                               |
| Depends on | WP-012                                                                           |
| Target     | `content-primitives-backend` shared authorization/audit services                 |
| Outcome    | One deny-safe permission, redaction, and audit pipeline for reads and operations |

## Human summary

**Why this matters:** Every read and operation needs the same backend security rules so that one interface cannot bypass permissions, expose restricted evidence, or omit an audit record.

**What will change:** A shared pipeline will resolve identities and resources, evaluate Backstage permissions and conditional rules, redact restricted fields, cache decisions safely, and emit immutable audit records. WP-012 operations will use this pipeline first.

**PR scope:** Define the authorization, redaction, audit, and retention contracts; implement the shared services; integrate WP-012; and add adversarial, cache, failure, redaction, and audit tests.

**Not in this PR:** This work does not implement future Representational State Transfer (REST), frontend, Scaffolder, Model Context Protocol (MCP), or source-administration consumers. Their owning work packages must integrate and prove the shared pipeline themselves.

**Success looks like:** Denied requests reveal nothing and cause no mutation, authorized changes always have correlated audit records, and permission-provider failures follow the approved deny-safe policy.

## Scope and changes

Centralize principal resolution, resource construction, Backstage permission evaluation, conditional-rule application, operation checks, field/evidence redaction, decision caching, and immutable audit emission. Integrate the pipeline into the WP-012 operation service and publish reusable seams for later REST, jobs, SSE, source administration, Scaffolder, frontend discovery, MCP, and AAP work packages. Those owning work packages provide their surface-specific integration evidence; this work package does not implement not-yet-existing consumers. UI hiding never substitutes for backend enforcement.

```ts
const decision = await authorizer.authorize({
  principal,
  permission,
  resource: { type: resourceType, id: resourceId, attributes },
});
if (decision.result !== 'ALLOW') throw new NotAllowedError();
await audit.record({
  principal,
  action,
  resourceRef,
  decision: 'ALLOW',
  correlationId,
});
```

## Implementation slices

1. Freeze principal/resource/action, deny/error, redaction, audit, and retention contracts.
2. Implement common authorization and conditional-rule evaluation.
3. Add field/evidence redaction before serialization/indexing/logging.
4. Commit operation authorization and audit intent in the correct transaction boundary.
5. Integrate WP-012, publish consumer integration fixtures, and add metrics/runbooks without sensitive cardinality.

## Required tests

- Anonymous, allowed, denied, conditional, stale identity, provider failure, and cross-resource cases.
- Denied reads/actions/SSE create no leakage or side effect.
- Audit includes principal/action/resource/decision/correlation/result but no token or secret.
- A representative consumer fixture and WP-012 invocation cannot bypass backend decisions.
- Cache invalidation and role/credential changes do not prolong access beyond approved limits.

### Acceptance criteria

- Given permission denial, every surface returns the approved safe behavior and produces no mutation.
- Given an authorized mutation, its audit record is correlated and cannot be silently omitted.
- Given restricted evidence, it is removed before leaving the owning service.
- Given permission-provider failure, the default behavior matches the approved deny-safe policy.

## Rollback and completion

Roll back the WP-012 integration while retaining backend enforcement; never fall back to allow-all. Done means security approves adversarial, redaction, audit, and reusable consumer-contract evidence. Cross-surface proof remains a completion condition of each later owning work package and WP-038.
