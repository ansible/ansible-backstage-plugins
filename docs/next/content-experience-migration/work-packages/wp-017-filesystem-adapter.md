# WP-017 — Filesystem adapter

| Field      | Value                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------- |
| Phase      | 5 — Source expansion                                                                      |
| Depends on | WP-004 and WP-007                                                                         |
| Target     | `backend-adapters/adapter-filesystem`                                                     |
| Outcome    | Explicitly configured local artifact ingestion for development and controlled deployments |

## Human summary

**Why this matters:** Local files are useful for development and controlled deployments, but unrestricted filesystem access could expose data or exhaust the service.

**What will change:** A read-only filesystem adapter will discover content only under explicitly configured roots. It will canonicalize paths, block traversal and symbolic-link escapes, apply deterministic ignore rules, enforce resource limits, and derive stable content digests.

**PR scope:** Define the configuration and trust boundaries, implement bounded discovery and reading, register the adapter with ingestion, document supported deployments, and test security, identity, lifecycle changes, cancellation, restart, and operational reporting.

**Not in this PR:** The adapter will not scan arbitrary filesystem locations or modify local files. Unsupported deployment modes must be rejected during startup rather than handled as best-effort configurations.

**Success looks like:** Every resolved path remains inside an approved root, oversized inputs stop with typed results instead of exhausting the process, and changed bytes create a new observation while old content remains addressable.

## Scope and changes

Implement discovery/read for configured roots only. Canonicalize paths, prevent traversal and symlink escape, bound recursion/files/count/bytes, make ignore rules deterministic, derive stable content digests, and define read-only watch or poll semantics. Filesystem sources use frozen source kind `filesystem` and lowercase RFC 4122 UUID source IDs.

```yaml
sources:
  - id: 018f2f6a-7b45-7b6a-91a1-2ac81234abcd
    kind: filesystem
    root: /var/lib/content
    include: ['**/*.yml', '**/*.yaml']
    followSymlinks: false
```

## Implementation slices

1. Approve deployment support and trust boundaries.
2. Add strict configuration schema and canonical root validation.
3. Implement bounded deterministic discovery/read/digest behavior.
4. Register with ingestion and applicable content types.
5. Add development/deployment docs and operational limits.

## Required tests

- **Unit/security:** `..`, absolute paths, symlink loops/escape, special files, permissions, Unicode/case behavior, ignores, and resource limits.
- **Integration:** add/change/delete, atomic replacement, partial read failure, cancellation, restart, and optional watch fallback.
- **Identity:** unchanged bytes keep digest; changed bytes create a new observation.
- **Operations:** scan duration, skipped/oversized files, errors, and configured-root status are visible without leaking file contents.

### Acceptance criteria

- Given any discovered path, its real path remains inside an approved root.
- Given an oversized tree/file, reconciliation terminates with typed partial/failed state rather than exhausting the process.
- Given a file changes, the old digest remains addressable and a new observation is emitted.
- Given an unsupported deployment mode, configuration fails clearly before startup.

## Rollback and completion

Disable/remove the source while retaining canonical historical records per retention policy. Done means traversal/resource/security tests pass in the actual deployment container.
