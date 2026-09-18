# WP-040 — PoC repository disposition

| Field      | Value                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| Phase      | 11 — Retirement                                                                                                          |
| Depends on | WP-039                                                                                                                   |
| Repository | `automation-content-plugins`                                                                                             |
| Outcome    | Intentional archive or published-package integration-harness conversion after all code/data/contract ownership transfers |

## Decision versus execution timing

Decide whether to archive the repository or convert it into a published-package integration harness early enough to guide extraction. Execute that approved disposition only after WP-039 retirement gates pass. This resolves the plan’s timing tension without pretending the final action can occur in Phase 0.

## Human summary

**Why this matters:** The proof-of-concept (PoC) repository cannot be archived or repurposed safely while active code, data, credentials, packages, pipelines, documentation, or users still depend on it. A complete disposition record prevents lost history, broken consumers, and abandoned security responsibilities.

**What will change:** Every repository asset will be mapped to a verified new home, an approved retirement, or a defined purpose in a published-package integration harness. The repository will then be archived or converted only after the compatibility retirement gates pass.

**PR scope:** After WP-039 gates pass, execute the previously approved disposition: verify the final asset and consumer inventory, preserve history and provenance, revoke or transfer automation and credentials, add redirects and support ownership, and record the start of the post-action observation window.

**Not in this PR:** The earlier disposition decision and extraction transfers are prerequisite evidence, not work repeated in this PR. No active capability or consumer will be treated as retired without documented evidence, and closure of the time-based observation window is recorded after it completes.

**Success looks like:** Searches find no undocumented active dependency on the PoC repository, and replacement repositories pass parity without its source or runtime. Required history, data, fixtures, issues, and release artifacts remain recoverable from approved systems.

## Scope and changes

Create a complete disposition manifest for source code, tests, fixtures, issues, releases, packages, container images, CI, secrets, docs, users, telemetry, data, browser state, dynamic artifacts, and support ownership. Map each retained capability to its new repository/package and commit. Preserve history/provenance and issue traceability.

```yaml
asset: src/content/oci-client.ts
disposition: moved
target: ansible-backstage-plugins/plugins/backend-adapters/adapter-oci
verified_by: WP-006
remaining_consumers: []
```

## Implementation slices

1. Confirm the previously approved archive or published-package integration-harness decision and assigned owner as prerequisite evidence.
2. Refresh and verify the asset/consumer/data/secret/CI/package inventory produced during extraction.
3. Verify every asset is moved, intentionally retired within the archive, or retained for the published-package harness with purpose.
4. Revoke credentials, disable or convert pipelines/publication, and preserve artifacts per the approved disposition.
5. Mark repository status, redirects, support process, and the start of post-action monitoring.

## Required tests/review

- Link/package/image/reference search finds no undocumented active consumer.
- Exported history, fixtures, issues, ADRs, licenses, and provenance are accessible.
- Data/browser/dynamic compatibility gates and rollback windows passed.
- Credentials/webhooks/bots/CI publishing are revoked or transferred and audited.
- New repositories build and pass parity without PoC source or runtime dependencies.
- A pre-disposition rehearsal restores repository settings, protected branches, pipeline definitions, redirects, and artifact access in a non-production copy.

### Acceptance criteria

- Given any PoC asset, the disposition manifest identifies a verified target, approved retirement, or retained purpose.
- Given final execution, no production deployment, documentation, lockfile, pipeline, or support runbook depends on the PoC.
- Given rollback window expiry, canonical data and release artifacts remain recoverable from approved systems.

## Rollback and completion

Trigger rollback during the approved observation window when a supported consumer, required artifact, provenance record, or replacement pipeline cannot operate without the prior repository state. The repository owner restores the preserved settings manifest, archive state, protected branches, pipeline definitions, support links, and reversible redirects from the rehearsal evidence. Revoked credentials are never restored; the owning security team provisions and rotates replacement credentials through the approved secret system. Published immutable artifacts and exported history remain retained independently of repository state. Record intentionally irreversible actions, their approver, and recovery alternative before execution.

Done means the disposition decision and later execution are separately approved, the rollback rehearsal passes before archive/conversion, intentionally irreversible actions are recorded, and consumer/security/operations checks evidence the result.
