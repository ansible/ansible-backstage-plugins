# WP-034 — Semantic search projection

| Field      | Value                                                                |
| ---------- | -------------------------------------------------------------------- |
| Phase      | 10 — Search, MCP, quality gates                                      |
| Depends on | WP-033                                                               |
| Target     | Optional semantic search projector/vector adapter                    |
| Outcome    | Rebuildable permission-safe embeddings derived from canonical events |

## Human summary

**Why this matters:** Optional meaning-based search requires carefully controlled embeddings—numerical representations of text—so restricted data is not exposed and the index can be rebuilt or rolled back safely.

**What will change:** Approved, redacted content will be split into versioned chunks and projected into a vector store, with each vector tied to its content version, model version, and authorization resource.

**PR scope:** Obtain required architecture, security, privacy, and legal approvals; implement deterministic redaction and chunking; add event-driven create, update, and delete jobs; and provide rebuild, migration, cost, outage, and deletion controls.

**Not in this PR:** Semantic projection will not be enabled or advertised without an accepted data and model decision. Projection failures will not block canonical writes or keyword search, and the combined search API is handled later.

**Success looks like:** Restricted evidence and secrets never enter embeddings, deleted content is removed within the approved time, model versions cannot mix, and the entire projection can be rebuilt from canonical state.

## Scope and changes

Define approved embedding inputs, redaction, chunking, model/provider/version, dimensions, distance metric, residency, retention, deletion, vector adapter, and rebuild. Bind each vector to content digest, document/chunk version, model version, and authorization resource. Projection failures never block canonical writes or lexical search.

```json
{
  "contentKey": "…",
  "digest": "sha256:…",
  "chunkVersion": "1",
  "model": "approved-model@version",
  "authorizationResource": { "sourceId": "…" },
  "textDigest": "sha256:…"
}
```

## Implementation slices

1. Obtain architecture, security, privacy, and legal approval for data/model choices.
2. Implement deterministic redaction/chunking with versioned fixtures.
3. Add outbox-driven embedding/upsert/delete jobs and checkpoints.
4. Add vector adapter abstraction and full rebuild/version migration.
5. Add lag, error, cost, deletion, drift, and provider-outage runbooks.

## Required tests

- Golden redaction/chunking, duplicate/out-of-order events, deletion, restart, and rebuild equivalence.
- Secret/restricted evidence exclusion and prompt-like text treated as untrusted data.
- Model/dimension/chunk version isolation and rollback.
- Permission metadata cannot be omitted; unauthorized vectors are not queried by WP-035.
- Provider/vector-store outage, quotas, cost, latency, and canonical-write isolation.

### Acceptance criteria

- Given no accepted privacy/model ADR, semantic projection remains disabled and unadvertised.
- Given access/content deletion, corresponding vectors disappear within the approved service-level agreement (SLA) with audit evidence.
- Given model change, old/new vector sets cannot mix and rollback is defined.
- Given infrastructure loss, projection rebuilds from canonical state and lexical search remains healthy.

## Rollback and completion

Pause projector and restore a prior model/index version or disable semantic search. Done means privacy, deletion, rebuild, isolation, and operational gates pass.
