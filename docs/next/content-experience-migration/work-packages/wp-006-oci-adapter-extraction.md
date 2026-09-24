# WP-006 — OCI adapter extraction

| Field         | Value                                                                         |
| ------------- | ----------------------------------------------------------------------------- |
| Phase         | 2 — Unified ingestion                                                         |
| Depends on    | WP-004                                                                        |
| Source/target | `automation-content-plugins` → `backend-adapters/adapter-oci`                 |
| Outcome       | Reused OCI Distribution v2 implementation behind the neutral adapter contract |

## Human summary

**Why this matters:** The proven Open Container Initiative (OCI) registry support should be reused without carrying execution-environment or portal-catalog assumptions into the source protocol layer.

**What will change:** Existing registry authentication, discovery, pagination, caching, manifest and blob handling, and referrer fallback will move behind the read-oriented neutral backend-adapter contract while preserving current behavior. Required legacy write primitives may move as package-private compatibility code but are not adapter capabilities.

**PR scope:** Relocate the protocol code with compatibility exports, add the neutral adapter and capability profile, inject authentication and cancellation safely, and validate it through existing fixtures, integration tests, and a compatibility consumer.

**Not in this PR:** The adapter will not classify execution environments, construct portal catalog entities, expose source mutations, or perform the final unified-pipeline migration owned by WP-007. Push, tag, delete, and other external effects require later WP-012/WP-013 operation handlers. The extraction will avoid unrelated stylistic rewrites.

**Success looks like:** Tags that move produce new immutable digest observations, one failing repository does not hide successful repositories, fallback behavior remains compatible, and production code no longer constructs the extracted client elsewhere.

## Scope and changes

Move the proven OCI client, auth, capability probing, pagination, digest cache, manifests/blobs, and native/fallback referrers without stylistic rewriting. Implement the read-oriented `BackendAdapter`; remove content-type and Catalog construction from protocol code. If preserving current imports requires relocating write methods, keep them package-private behind compatibility wrappers and do not expose them through the adapter contract or capability profile. Preserve repository failure isolation, prior-data retention, and mutable-tag-to-digest behavior.

```ts
// Illustrative mapping around existing protocol code.
export class OciBackendAdapter implements BackendAdapter {
  readonly id: string;
  async resolve(
    ref: SourceReference,
    signal: AbortSignal,
  ): Promise<ResolvedArtifact> {
    const manifest = await this.client.getManifest(
      ref.repository,
      ref.reference,
      { signal },
    );
    return {
      digest: manifest.digest,
      mediaType: manifest.mediaType,
      sourceUri: ref.uri,
    };
  }
}
```

## Implementation slices

1. Freeze existing OCI protocol fixtures and public exports.
2. Relocate protocol code unchanged with compatibility re-exports.
3. Add the neutral adapter façade and capability profile.
4. Remove EE/Catalog assumptions and inject auth/cancellation safely.
5. Publish the package and prove consumption through a compatibility consumer/contract harness. WP-007 replaces that consumer when it builds the unified pipeline.

## Required tests

- **Unit/contract:** auth challenges, probing, repository/tag pagination, manifest/blob reads, digest resolution, cache invalidation, referrer fallback, and rejection of mutation capability through `BackendAdapter`.
- **Compatibility:** any retained write primitive is package-private, reachable only through the frozen legacy wrapper, and cannot be registered or invoked as a neutral adapter capability.
- **Integration:** representative OCI registry, partial repository failure, rate limits, cancellation, and prior-data retention.
- **Architecture:** no EE classification, Catalog entity construction, or direct client construction outside this package.
- **Security:** credential redaction, TLS policy, bounded responses, and no arbitrary credential forwarding.

### Acceptance criteria

- Given a tag moves, the adapter emits a new immutable digest observation and does not move digest-owned state.
- Given one repository fails, successful repository observations remain available.
- Given referrers are unsupported, approved fallback behavior matches current fixtures.
- Given an adapter consumer requests push, tag, or delete, no such neutral capability exists and no registry mutation occurs.
- Given current OCI/EE fixtures, results remain equivalent through the neutral façade.

## Rollback and completion

Retain old imports as deprecated re-exports and feature-flag ingestion per registry. Done means the package is published, the compatibility consumer and existing tests pass, and no current production path constructs the extracted OCI client elsewhere. WP-007 owns unified-pipeline adoption.
