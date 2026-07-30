# US-003 — Register a repo without AAP OAuth

| Field | Value |
|-------|--------|
| **Status** | Complete |
| **Persona** | Developer |
| **Surface** | Add repository / Create template flow |
| **Depends on** | Catalog scaffolder + git-repository registration routes |

## Story

> As a developer, I want to register a Git repository into the catalog for
> Quality scans without signing into AAP OAuth, so local and Portal demos are
> not blocked by RH AAP login.

## Acceptance criteria

- [x] **Add repository** uses stock Create when
      `ansible.apme.useStockCreateForRegister: true` —
      `/create/templates/default/apme-register-git-repository` (no AAP OAuth).
- [x] Default / Portal path remains Self-service Create
      (`/self-service/create/templates/...`) when the flag is unset/false.
- [x] Registered entity appears in catalog with SCM annotations suitable for
      the Quality tab ([US-001](US-001-quality-tab-scan-with-ai.md)).
- [x] Path chosen and documented: **`useStockCreateForRegister`** with
      `GitHubRepoUrlField` (paste github.com URL; live owner/repo parse;
      branch field; github.com-only validation). Not ManualGitProvider.
- [x] Verified in local loop (Add repository → Git Repositories list →
      Quality scan).

## Notes

- Guest header action: `ApmeAddRepositoryHeaderAction` via
  `getPageHeaderActions` (ADR-010).
- Register template uses `ui:field: GitHubRepoUrlField` (not `RepoUrlPicker`).
- Local loop (`apme-rhdh-dev`) sets `useStockCreateForRegister: true` in
  `app-config.local.yaml` and `app-config.react.yaml`.
- Related branch reference: `feat/apme-use-stock-create-for-register`.
