# WP-002 — Architecture ADR set

| Field      | Value                                                                      |
| ---------- | -------------------------------------------------------------------------- |
| Phase      | 0 — Freeze behavior                                                        |
| Depends on | WP-001                                                                     |
| Repository | `ansible-backstage-plugins`                                                |
| Outcome    | Approved, testable decisions for every cross-package boundary and rollback |

## Human summary

**Why this matters:** The migration crosses several packages and systems, so important architectural choices must be explicit before implementation begins. This prevents individual pull requests from making incompatible or difficult-to-reverse decisions.

**What will change:** A reviewed set of Architecture Decision Records (ADRs) will define boundaries, ownership, identity, storage, delivery, search, security, compatibility, packaging, and rollback expectations.

**PR scope:** Create the ADR index and ownership matrix, document each required decision and its alternatives, and link every accepted decision to evidence and an enforcing test or later work package.

**Not in this PR:** No production implementation belongs here. Vendors, algorithms, and deferrals such as Gitea support will not be selected without the required approval and documented follow-up.

**Success looks like:** Every required decision has one accepted, owned, non-conflicting ADR that gives implementers enough detail to build, secure, operate, and roll back the resulting system.

## Scope and changes

Write and approve ADRs for: backend/content-type separation; digest identity; Catalog as projection; typed operation registration; repository/domain ownership; compatibility policy; PostgreSQL and transactional outbox ownership; delivery, leasing and dead letters; lexical/vector search and embedding privacy; Automation Hub protocol ownership; AAP delegated authorization; Gitea delivery or dated deviation; dynamic descriptor versioning, artifact trust and deployment allowlists; package naming; and every intentionally changed V4 capability.

Each ADR must state context, decision, alternatives, consequences, migration, observability, security, rollback, owner, and supersession rules. It must reference WP-001 evidence and an architecture test or later WP that enforces it.

```yaml
# Illustrative ADR decision metadata.
status: accepted
owners: [architecture, security, operations]
enforced_by:
  - test: plugins/content-primitives/architecture.test.ts
  - work_package: WP-004
rollback_trigger: 'documented measurable condition'
```

## Implementation slices

1. Create an ADR index and decision-owner matrix.
2. Approve foundational identity, projection, adapter-axis, operation, and ownership ADRs.
3. Approve persistence/outbox/search and credential/security ADRs.
4. Approve compatibility, package versioning, Gitea, and dynamic artifact ADRs.
5. Link every ADR to plan requirements and enforcing tests.

## Required tests and review

- **Traceability:** every required decision has one accepted ADR and owner.
- **Consistency:** no ADR conflicts with frozen contracts or another accepted ADR.
- **Architecture:** proposed dependency graphs satisfy runtime separation.
- **Security/operations:** security and operations approve credential, artifact, storage, queue, and rollback decisions.
- **Recovery:** each stateful ADR defines upgrade, downgrade, backup, and recovery consequences.

### Acceptance criteria

- Given the required-decision list, when the index is checked, then no decision is missing, duplicated, or still implicit.
- Given an ADR, when an implementer reads it, then implementation and rollback can proceed without choosing an unstated architecture.
- Given Gitea is deferred, then an approved deviation identifies release, owner, tracking issue, rejected UI behavior, and removal date.

## Out of scope and completion

No production implementation belongs here. Do not choose vendors or algorithms without named approval. Done means all blocking ADRs are accepted, linked from the migration plan, and accompanied by enforceable follow-up work.
