# US-003 — Register a repository from Git Repos

| Field | Value |
|-------|--------|
| **Status** | Complete |
| **Persona** | Developer (portal user) |
| **Surface** | Git Repositories → **Add repository** → Self-service Create template |
| **Depends on** | Catalog scaffolder + `ansible:register:git-repository` |

## Story

> As a developer using the automation portal, I want to register my playbook
> or automation repository from **Add repository** so it appears in Git Repos
> and I can run Quality scans — without leaving the portal or using a separate
> developer-only registration path.

## Acceptance criteria

- [x] **Add repository** opens the Self-service Create template
      `/self-service/create/templates/default/apme-register-git-repository`.
- [x] Completing the template (direct register, default) adds a catalog entity
      with SCM annotations suitable for the Quality tab
      ([US-001](US-001-quality-tab-scan-with-ai.md)).
- [x] Repository URL entry uses `GitHubRepoUrlField` (paste github.com URL;
      owner/repo parse; branch field; github.com-only validation).
- [x] After register, the entity is visible under **Git Repositories** and
      Quality can be opened from the list/detail chrome
      ([US-002](US-002-git-repos-chrome.md)).

## Out of scope

- Alternate “stock Create” (`/create/...`) or app-config switches for local
  developer loops — not a product surface.
- Opening a catalog-info.yaml pull request instead of direct register (optional
  template checkbox; secondary path).

## Notes

- Header action: `ApmeAddRepositoryHeaderAction` via `getPageHeaderActions`
  (ADR-010).
- Template (owned by APME):
  `plugins/backstage-apme/templates/apme-register-git-repository/` —
  loaded via `catalog.locations` (not bundled by `export-dynamic`).
