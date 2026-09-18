# Content Experience Migration Work Packages

This directory expands the work-package register in the [Content Experience Architecture Refactoring and Migration Plan](../Content%20Experience%20Architecture%20Refactoring%20and%20Migration%20Plan.md) into implementation briefs. Each brief is an executable specification for an implementation agent; the migration plan and approved ADRs remain authoritative.

## Execution protocol

1. Work on one work package, or one explicitly listed PR slice, at a time.
2. Verify every prerequisite using linked artifacts; a dependency being merged is not sufficient unless its exit evidence is green.
3. Preserve baseline behavior until the relevant contract-family retirement gate passes.
4. Do not resolve a `TBD` or decision gate by assumption. Record the decision in an ADR and obtain the named approval.
5. Keep package moves separate from behavior changes where practical.
6. Update generated compatibility and runtime-registration ledgers in the same PR as a public contract change.
7. Attach test output, migration evidence, and rollback evidence to the PR.

## Shared completion checks

Every implementation PR must run the checks available in each repository it changes:

| Repository                        | Required workspace checks                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ansible-backstage-plugins`       | `yarn prettier:check`, `yarn lint:all`, `yarn tsc`, `yarn test`, `yarn openapi:lint`, and `yarn openapi:check-drift`                                         |
| `automation-content-plugins`      | `yarn prettier:check`, `yarn lint:all`, `yarn tsc`, and `yarn test`                                                                                          |
| New APME or deployment repository | The checked-in repository policy and every applicable build, lint, type, test, artifact, and deployment-manifest gate; the PR must record the exact commands |

OpenAPI lint and drift checks are mandatory only in repositories that own an OpenAPI document and provide those scripts. Also run package-specific contract, database, frontend, dynamic-plugin, security, resilience, and cross-surface suites required by the brief. Documentation-only changes may use the narrower checks defined by repository policy.

## Work-package index

| Phase | Work packages                                                                                                                                                                                                                                                                                                                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | [WP-001](work-packages/wp-001-contract-and-behavior-fixture-inventory.md), [WP-002](work-packages/wp-002-architecture-adr-set.md)                                                                                                                                                                                                                                                                       |
| 1     | [WP-003](work-packages/wp-003-common-primitive-contracts.md), [WP-004](work-packages/wp-004-node-adapter-processor-contracts.md), [WP-005](work-packages/wp-005-shared-api-dto-client.md)                                                                                                                                                                                                               |
| 2     | [WP-006](work-packages/wp-006-oci-adapter-extraction.md), [WP-007](work-packages/wp-007-unified-ingestion-orchestrator.md), [WP-008](work-packages/wp-008-ee-runtime-split-and-adapter-correction.md), [WP-041](work-packages/wp-041-automation-hub-adapter-extraction.md)                                                                                                                              |
| 3     | [WP-009](work-packages/wp-009-postgresql-content-schema.md)–[WP-010](work-packages/wp-010-reconcile-outbox-idempotency.md)                                                                                                                                                                                                                                                                              |
| 4     | [WP-011](work-packages/wp-011-normalized-read-api.md), [WP-012](work-packages/wp-012-operation-registry-and-invocation.md), [WP-013](work-packages/wp-013-permission-audit-pipeline.md), [WP-014](work-packages/wp-014-legacy-content-api-aliases.md), [WP-044](work-packages/wp-044-aap-delegated-authorization.md)                                                                                    |
| 5     | [WP-015](work-packages/wp-015-git-adapter-extraction.md), [WP-016](work-packages/wp-016-collection-content-type-adapter.md), [WP-017](work-packages/wp-017-filesystem-adapter.md), [WP-042](work-packages/wp-042-source-settings-administration.md)                                                                                                                                                     |
| 6     | [WP-018](work-packages/wp-018-catalog-projector.md), [WP-019](work-packages/wp-019-primitive-processor-framework.md), [WP-020](work-packages/wp-020-initial-trust-processors.md), [WP-021](work-packages/wp-021-initial-quality-intent-processors.md)                                                                                                                                                   |
| 7     | [WP-022](work-packages/wp-022-portal-extension-api.md), [WP-023](work-packages/wp-023-multi-provider-extension-host.md), [WP-024](work-packages/wp-024-git-repository-extension-adapter.md), [WP-025](work-packages/wp-025-generic-content-frontend.md), [WP-043](work-packages/wp-043-dynamic-runtime-registration-ledger.md)                                                                          |
| 8     | [WP-026](work-packages/wp-026-scaffolder-operation-bridge.md)–[WP-027](work-packages/wp-027-aap-operation-registrations.md)                                                                                                                                                                                                                                                                             |
| 9     | [WP-028](work-packages/wp-028-apme-database-migration.md), [WP-029](work-packages/wp-029-apme-backend-plugin-and-operation-module.md), [WP-030](work-packages/wp-030-apme-frontend-registration.md), [WP-031](work-packages/wp-031-apme-catalog-compatibility-module.md), [WP-032](work-packages/wp-032-apme-dynamic-extraction.md), [WP-045](work-packages/wp-045-apme-browser-state-compatibility.md) |
| 10    | [WP-033](work-packages/wp-033-lexical-search-collator.md), [WP-034](work-packages/wp-034-semantic-search-projection.md), [WP-035](work-packages/wp-035-intent-and-hybrid-search-api.md), [WP-036](work-packages/wp-036-mcp-stable-tools.md), [WP-037](work-packages/wp-037-mcp-dynamic-operation-tools.md), [WP-038](work-packages/wp-038-cross-surface-parity-suite.md)                                |
| 11    | [WP-039](work-packages/wp-039-compatibility-telemetry-deprecation.md)–[WP-040](work-packages/wp-040-poc-repository-disposition.md)                                                                                                                                                                                                                                                                      |

## Shared PR evidence

Each PR description records the work-package ID and phase, changed schemas, persistence and rollback impact, permissions and audit behavior, compatibility mechanism and removal condition, tests and parity evidence, dynamic packaging impact, operational/documentation changes, and explicitly excluded follow-up work.
