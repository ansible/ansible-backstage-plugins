# WP-036 — MCP stable tools

| Field      | Value                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| Phase      | 10 — Search, MCP, quality gates                                                    |
| Depends on | WP-005, WP-011, WP-012, WP-013, WP-026, and WP-035                                 |
| Target     | `content-primitives-mcp` using `content-primitives-client`                         |
| Outcome    | Small, versioned, permission-preserving tools over normalized content capabilities |

## Human summary

**Why this matters:** Model Context Protocol (MCP) clients need a small, predictable set of tools that exposes the same authorized content facts and operations as the normalized portal application programming interfaces (APIs).

**What will change:** Versioned tools will support content search, intent and requirements resolution, content details, trust, provenance, and approved template scaffolding. Inputs will be bounded and outputs concise.

**PR scope:** Freeze tool names and schemas, implement handlers through the shared content client, preserve caller identity and authorization, add safe provenance-aware formatting, and publish compatibility, audit, metrics, and deprecation guidance.

**Not in this PR:** MCP code will not import backend implementations, repositories, adapters, databases, or Catalog internals, and scaffolding will not render templates or access source control directly. General operation discovery, invocation, job-status, and cancellation tools are deferred to WP-037 unless explicitly added to the approved stable-tool inventory before this PR begins.

**Success looks like:** MCP and normalized APIs return equivalent authorized facts, instructions embedded in content cannot trigger tools, and approved template-scaffolding calls remain confirmed, idempotent, and auditable. The required provenance tool remains `get_provenance_chain`, with the old name present only if baseline evidence requires a measured deprecated alias.

## Scope and changes

Expose the approved stable tools for content search, intent resolution, content details, trust, provenance, requirements resolution, and approved template scaffolding. The provenance tool is named `get_provenance_chain`; retain `get_production_chain` only when WP-001 proves an external contract, and then as a measured deprecated alias with identical authorization/output. General operation discovery/invocation and job status/cancel are owned by WP-037; changing that boundary requires an approved update to the stable-tool inventory before implementation. Every handler uses `content-primitives-client` against normalized REST with the caller identity/correlation context and WP-013 authorization semantics; MCP imports no backend implementation, repository, adapter, database, or Catalog internals. WP-035 supplies only search/intent resolution. Approved template scaffolding must use the registered typed operation/Scaffolder boundary rather than local template rendering or SCM access. Tool names and schemas are stable/versioned, inputs bounded, outputs concise and provenance-aware, and destructive/long-running operations require typed registered operations plus confirmation policy.

```json
{
  "name": "content_get",
  "inputSchema": {
    "type": "object",
    "required": ["contentKey"],
    "properties": {
      "contentKey": { "type": "string", "maxLength": 512 },
      "digest": { "type": "string", "maxLength": 256 }
    },
    "additionalProperties": false
  }
}
```

## Implementation slices

1. Freeze the required stable inventory and exact `get_provenance_chain` name; decide from WP-001 evidence whether a `get_production_chain` alias is required; approve naming/versioning, pagination/output, scaffolding, and confirmation rules.
2. Implement handlers solely through `content-primitives-client`: use WP-035 endpoints for search/intent, normalized content/primitive/provenance endpoints for read tools, and the approved typed operation endpoint only for template scaffolding.
3. Add semantic-state/provenance-safe response formatting.
4. Add the approved template-scaffolding tool through the typed operation/Scaffolder boundary with idempotency and confirmation gates; leave general dynamic operation/job tools to WP-037.
5. Publish examples, compatibility policy, audit/metrics, and deprecation process.

## Required tests

- JSON schema positive/negative/fuzz/bounds tests for every tool.
- REST/tool output and error equivalence for identical principal/request.
- Prompt injection in source content cannot alter tool routing or invoke operations.
- Permission denial, sensitive evidence, audit, rate limit, cancellation, duplicate template-scaffolding operation, and confirmation behavior.
- Architecture tests reject backend implementation, repository, adapter, database, and Catalog imports from `content-primitives-mcp`.
- Tool registry snapshot prevents accidental rename/removal/schema break.
- Registry tests require approved template scaffolding and `get_provenance_chain`; `get_production_chain` is absent unless baseline evidence requires the deprecated alias.

### Acceptance criteria

- Given identical authorized input, MCP returns facts and semantic states consistent with REST.
- Given content contains instructions, it remains quoted untrusted data and cannot cause another tool call.
- Given an operation requires confirmation, execution cannot occur without the documented confirmation token/context.
- Given a breaking schema change, a new tool/version and migration window are required.

## Rollback and completion

Disable individual registrations while retaining previous supported versions. Done means all tools pass schema, authorization, injection, idempotency, parity, and audit gates.
