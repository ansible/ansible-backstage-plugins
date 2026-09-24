# WP-012 — Operation registry and invocation

| Field      | Value                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| Phase      | 4 — Read/write API                                                                 |
| Depends on | WP-004, WP-009, and WP-010                                                         |
| Target     | `content-primitives-node` and `content-primitives-backend`                         |
| Outcome    | Typed registered operations and durable invocation replace arbitrary URL execution |

## Human summary

**Why this matters:** Allowing callers to execute arbitrary Uniform Resource Locators (URLs) is unsafe and difficult to govern. A registered operation model makes available actions explicit, typed, authorized, and supportable.

**What will change:** Backend-owned handlers will be registered under stable operation identifiers with schemas, permissions, exposure rules, ownership, and execution metadata. Calls can run synchronously or as durable jobs with idempotency, cancellation, timeouts, retained results, and typed errors.

**PR scope:** Define and validate operation descriptors, implement discovery and invocation, persist job state, publish client contracts, and test security, retries, restarts, multiple replicas, cancellation, and event-stream behavior.

**Not in this PR:** Callers will not be allowed to provide target URLs, methods, headers, credentials, or implementation class names. WP-013 will replace the provisional deny-by-default authorization port with the shared production permission and audit pipeline.

**Success looks like:** Unregistered or unsafe requests fail before any side effect, repeated equivalent commands produce only one effect, and job state remains readable after a restart.

## Scope and changes

Define versioned operation descriptors, registration, discovery, applicability, invocation, idempotency, synchronous/job execution, cancellation, and typed errors. Every descriptor contains globally unique ID and semantic version, title/description, query-or-command mode, synchronous-or-asynchronous execution, JSON input/output schemas, permission/resource declaration, resource derivation from input, REST/UI/Scaffolder/MCP exposure flags, audit category/sensitivity, owner/support metadata, command idempotency behavior, job cancellation support, and minimum host contract version. Handler code is backend-owned and selected by stable operation ID; discovery returns metadata only, and callers cannot supply target URLs, methods, headers, credentials, or implementation class names.

WP-012 defines a deny-by-default `OperationAuthorizationPort` and tests invocation with a deterministic provisional implementation. WP-013 replaces that implementation with the shared permission/redaction/audit pipeline. This avoids a dependency cycle while preventing unauthenticated invocation.

```ts
interface OperationDescriptor<I, O> {
  id: string;
  version: string;
  title: string;
  description: string;
  mode: 'query' | 'command';
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  permission: { name: string; resourceType?: string };
  deriveResource: ResourceDerivation;
  exposure: { rest: boolean; ui: boolean; scaffolder: boolean; mcp: boolean };
  audit: { category: string; sensitivity: string };
  owner: { team: string; support: string };
  minimumHostContractVersion: string;
  requiredCapabilities: string[];
  execution: 'synchronous' | 'job';
}
```

## Implementation slices

1. Freeze every mandatory descriptor field, discovery, invocation, job/SSE, error, and version contract.
2. Add registry validation for duplicate IDs, schema compatibility, and capabilities.
3. Implement authenticated invocation and durable idempotency/job state.
4. Add cancellation, timeout, retry policy, result retention, and correlation.
5. Publish handler example, OpenAPI/client bindings, and operational telemetry.

## Ordered PR series

1. **Descriptor contracts:** publish the Node extension point, descriptor schema, compatibility/version rules, and registry validation with no production handler enabled.
2. **Durable invocation core:** add authenticated invocation, idempotency, and synchronous/job persistence behind the deny-by-default authorization port; commit job/result state and its outbox entries atomically through WP-010.
3. **Job lifecycle:** add cancellation, timeout, retry, retention, restart, multi-replica, outbox redispatch/deduplication, and event-stream behavior while registrations remain individually gated.
4. **REST and client surface:** publish OpenAPI, discovery/invocation/job endpoints, generated client bindings, one real handler, and operational telemetry.

Each PR must be independently green, reject arbitrary network targets, leave handlers disabled by default until their prerequisites pass, and roll back by disabling registrations without deleting retained job history.

## Required tests

- Registration collision, schema validation, applicability, version mismatch, missing capability, and handler isolation.
- Descriptor validation rejects missing/invalid resource derivation, exposure, audit/sensitivity, owner/support, idempotency/cancellation, or minimum-host metadata.
- Duplicate invocation, restart, multiple replicas, cancellation races, timeout, and upstream failure.
- Crash-boundary tests prove job/result state and corresponding outbox entries commit atomically; redispatch is idempotent and cannot lose a terminal event.
- Arbitrary URL/method/header and SSRF attempts fail before network access.
- Discovery and direct invocation enforce identical authorization context through the provisional deny-by-default authorization port; WP-013 provides and proves the production pipeline implementation.
- Job/SSE ordering, reconnect, terminal state, audit correlation, and redaction.

### Acceptance criteria

- Given an unregistered ID or arbitrary URL, execution is rejected before side effects.
- Given the same idempotency key/principal/operation/input, only one operation effect occurs.
- Given restart, durable job/result state remains readable and converges.
- Given handler removal, discovery stops advertising it while retained job history stays readable.

## Rollback and completion

Disable individual registrations; preserve existing named actions until their compatibility gates pass. Never re-enable arbitrary URL execution. Done means one real handler passes sync/job, security, idempotency, and restart tests.
