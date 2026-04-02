# Ansible Backstage Plugins Constitution

## Core Principles

### I. Extend, Don't Duplicate

Prefer extending existing plugins over creating new packages. The self-service plugin IS the portal frontend. The backstage-rhaap-common IS the shared library. Only create new packages when architecturally necessary (e.g., backstage-rhaap-backend for standalone REST API).

### II. Backstage Patterns

Follow Backstage's official patterns: `createBackendModule`, `createPlugin`, `createRoutableExtension`, `createComponentExtension`. Use `coreServices` for dependency injection. Register permissions via `permissionsRegistry.addPermissions()`.

### III. Dynamic Plugin Support

All plugins MUST support RHDH dynamic plugin loading via `export-dynamic`. Frontend plugins use Scalprum. Backend plugins use `dynamicPluginsFeatureLoader`. Every new export must be verifiable in both static (local dev) and dynamic (RHDH production) modes.

### IV. Security First (NON-NEGOTIABLE)

- Secrets encrypted at rest (AES-256-GCM with versioned prefix `enc:v1:`)
- Secrets NEVER returned in API responses (use `hasToken: true` pattern)
- No `execFile`, `exec`, or shell spawning from web-facing processes
- Graceful restart via `process.exit(0)` + orchestrator
- Input validation on all API endpoints (URL format, non-empty, parameterized queries)

### V. API-First Design

All functionality accessible via REST API for config-as-code automation. OpenAPI 3.1 specs committed to repository, CI-validated against implementation. Consistent response envelope: `{ success, data?, error? }`. Semantic operationIds for agentic AI integration.

### VI. Test Coverage

- > 80% code coverage for all new code
- Existing tests must not regress
- Crypto/encryption code: >90% coverage
- Config tree builder: >90% coverage (critical integration point)

## Technical Stack

- TypeScript ~5.8, Node.js 20/22, Yarn 4 (Corepack)
- Backstage ^0.33.1, React 18, Material-UI v4
- PostgreSQL (production), better-sqlite3 with directory-based storage (local dev)
- Jest + RTL (unit), Playwright (E2E)

## Architecture Constraints

- AAP is the primary and permanent IDP
- Community Backstage plugins must work unchanged (config from DatabaseConfigSource)
- SCM providers are supplementary (content discovery + scaffolder push SSO)
- Deployments: OpenShift (Helm chart), RHEL appliance (bootc/Quadlet), Local dev

## Quality Gates

1. `yarn tsc` — zero errors
2. `yarn lint` — zero errors
3. `yarn test` — zero regressions
4. OpenAPI spec matches implementation

## Governance

This constitution supersedes ad-hoc decisions. Amendments require documentation in this file with rationale. All PRs must verify compliance with these principles.

**Version**: 1.0.0 | **Ratified**: 2026-03-25 | **Last Amended**: 2026-03-25
