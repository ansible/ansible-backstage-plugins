# US-003 — Register a repo without AAP OAuth

| Field | Value |
|-------|--------|
| **Status** | Planned |
| **Persona** | Developer |
| **Surface** | Add repository / Create template flow |
| **Depends on** | Catalog scaffolder + git-repository registration routes |

## Story

> As a developer, I want to register a Git repository into the catalog for
> Quality scans without signing into AAP OAuth, so local and Portal demos are
> not blocked by RH AAP login.

## Acceptance criteria

- [ ] **Add repository** (or equivalent) completes with Guest / stock Create —
      no AAP OAuth popup required in the default local loop.
- [ ] Registered entity appears in catalog with SCM annotations suitable for
      the Quality tab ([US-001](US-001-quality-tab-scan-with-ai.md)).
- [ ] Path chosen and documented: `useStockCreateForRegister` **or**
      register-without-PR / ManualGitProvider — pick one, not both.
- [ ] Verified in local loop.

## Notes

- Local config already sets `ansible.apme.useStockCreateForRegister: true`;
  story is complete when the eap-next plugin path fully honors it end-to-end.
- Related branch reference: `feat/apme-use-stock-create-for-register`.
