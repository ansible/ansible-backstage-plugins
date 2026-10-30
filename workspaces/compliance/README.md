# Compliance workspace

Ansible Automation Platform (AAP) compliance scanning, findings review, and
selective remediation for Red Hat Developer Hub / Backstage.

Mounted in the Automation Portal at **`/compliance`**.

> **Status: proof of concept, under active development.** Interfaces, config
> shape, API routes, and permission names all still move without notice.
> Nothing here is supported or ready to depend on.

Imported from the standalone [aap-compliance-pipelines][poc-repo] proof of
concept and adapted to the Portal SDK and monorepo conventions.

[poc-repo]: https://github.com/ansible/aap-compliance-pipelines

## Plugins

| Directory                     | Package                              | Role             |
| ------------------------------ | ------------------------------------- | ---------------- |
| `plugins/compliance`           | `@ansible/plugin-compliance`          | Frontend plugin  |
| `plugins/compliance-backend`   | `@ansible/plugin-compliance-backend`  | Backend plugin   |
| `plugins/compliance-common`    | `@ansible/compliance-common`          | Common library   |

The backend package is registered in the development backend at
`workspaces/portal-core/packages/backend/src/index.ts`.

## What this covers

- Launching compliance scans against registered AAP job templates
- Ingesting normalized findings (OpenSCAP / DISA STIG results) from AAP
  Controller job runs via a hardened ingest pipeline
- Reviewing findings and launching selective remediation jobs
- Compliance profile registration and lifecycle (connect / disconnect)

**Not covered by this workspace (yet):** execution environment build-time
rule extraction and the `profiles/` Ansible collection content used to seed
and run scans inside AAP. See the standalone `aap-compliance-pipelines`
repository for that content; it is integrated with AAP directly today and
has not been ported into this monorepo.

## Ingest endpoint security

Findings are posted to the backend by an Ansible Controller job (not an
interactive Backstage user), so `/findings/ingest` and the scan-artifact
registration route cannot rely on a normal user session. Security is
layered:

1. **AuthN** — the Controller job authenticates as a Backstage service
   caller using a `backend.auth.externalAccess` static token, stored as an
   AAP Controller Credential (not a plaintext `extra_var`).
2. **AuthZ** — the caller must hold the `compliance.findings.ingest`
   permission (RBAC), checked via the standard Backstage permissions
   framework.
3. **Scoping** — a per-scan ingest token (ADR-010) further restricts the
   caller to the specific scan it was issued for, with a TTL, a
   scan-state guard, and invalidation on finalize.

See [`docs/adrs/`](docs/adrs/) for the full design history.

## Design decision records

Design decision records live in [`docs/adrs/`](docs/adrs/), migrated from the
standalone prototype's `specs/compliance-pipelines/decisions/` directory.
