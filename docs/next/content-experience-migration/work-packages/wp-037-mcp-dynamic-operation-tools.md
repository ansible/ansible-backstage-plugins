# WP-037 — MCP dynamic operation tools

| Field      | Value                                                                        |
| ---------- | ---------------------------------------------------------------------------- |
| Phase      | 10 — Search, MCP, quality gates                                              |
| Depends on | WP-012 and WP-036                                                            |
| Target     | MCP server dynamic tool generator                                            |
| Outcome    | Exposure-controlled tools generated only from approved operation descriptors |

## Human summary

**Why this matters:** Model Context Protocol (MCP) clients must not gain access to operations simply because those operations exist. Dynamic tools need the same authorization, confirmation, safety, and audit controls as other interfaces.

**What will change:** Approved operation definitions will generate predictable, versioned MCP tools with validated inputs, bounded outputs, required confirmations, and isolated failures. Administrators will be able to audit registration changes and disable exposed tools without affecting unrelated stable read tools.

**PR scope:** Add the allowlist policy, operation-to-tool conversion, registry refresh and version handling, normalized invocation path, diagnostics, audit links, emergency disable support, and related tests and documentation.

**Not in this PR:** Operations that lack both explicit MCP exposure and deployment approval will not be registered. This work does not create an alternative execution path around the normalized application programming interface (API) and client.

**Success looks like:** Only approved tools are discoverable and executable, incompatible changes cannot silently alter existing tools, and missing confirmation prevents execution. Authorization, prompt-injection resistance, cancellation, output limits, lifecycle, idempotency, and redacted audit tests all pass.

## Scope and changes

Generate MCP operation tools from WP-012 descriptors that pass an explicit exposure allowlist/policy. Implementation requires WP-012 descriptor/discovery/invocation exit evidence in addition to the WP-036 MCP client and identity path. Use operation ID/version, schemas, permission metadata, execution mode, sensitivity, confirmation requirement, and output bounds. Tool naming/versioning is deterministic. Registration changes are auditable and runtime failures are isolated. Handlers invoke only the normalized API/client path established for MCP.

```yaml
operationId: aap.job-template.launch
exposure:
  mcp: true
toolName: aap_job_template_launch_v1
requiresConfirmation: true
maxOutputBytes: 32768
```

## Implementation slices

1. Approve exposure/allowlist, naming, schema conversion, confirmation, and removal policy.
2. Implement descriptor-to-tool conversion with unsupported-schema rejection.
3. Add registry refresh/version coexistence and isolated diagnostics.
4. Route invocations through normalized operation APIs with idempotency/audit.
5. Add exposure dashboards, emergency disable, documentation, and deprecation.

## Required tests

- Allowlisted/non-allowlisted, duplicate name, incompatible schema, operation upgrade/removal, and registry refresh.
- Input/output schema conversion, bounds, cancellation, job handling, and idempotency.
- Permission and AAP delegated authorization parity; denied calls have no effect.
- Prompt injection cannot alter routing, bypass confirmation, or expose an unregistered operation.
- Audit links MCP principal/tool/operation/job/result with redaction.

### Acceptance criteria

- Given an operation without descriptor `exposure.mcp=true` and deployment allowlist approval, no MCP tool is generated.
- Given a descriptor changes incompatibly, existing tool version is retained or a new version is generated; silent mutation is rejected.
- Given required confirmation is absent, no operation executes.
- Given emergency disable, tool discovery/invocation stops without disabling unrelated stable read tools.

## Rollback and completion

Restore prior allowlist/descriptor snapshot or disable dynamic tools. Done means exposure, schema, permission, injection, idempotency, lifecycle, and audit tests pass.
